import type { Queue } from "bullmq";
import type Database from "database/src/models/Database";
import type { ExplanationAudios } from "database/src/models/public/ExplanationAudios";
import type { Transaction } from "kysely";
import { NotFoundError, UnauthorizedError } from "../../common/errors";
import type { db } from "../../shared/shared.plugin";
import type { ObjectStorageService } from "../../shared/storage/storage.service";
import { createTtsProvider } from "../../shared/tts/tts-provider.factory";
import type { TtsProvider } from "../../shared/tts/tts-provider.interface";
import {
  AUDIO_GENERATION_QUEUE,
  type AudioGenerationJobData,
  audioGenerationJobId,
  audioGenerationQueue,
} from "./audio-generation.queue";
import {
  AudioRepository,
  type AudioVariantKey,
  contentHashOf,
  storageKeyFor,
} from "./audio.repository";

const ESTIMATED_READY_SECONDS = 8;
const GUEST_ALLOWED_BOOK_ID = 1; // Genesis (br-audio-013)
const GUEST_ALLOWED_CHAPTER_NUMBER = 1;
const DEFAULT_VOICE_EN = process.env.TTS_VOICE_EN ?? "alloy"; // br-audio-009

export type KyselyTransaction = Transaction<Database>;

export interface AudioVariant {
  voice: string;
  language_code: string;
}

/**
 * Reader-facing DTO (br-audio-007 stub transparency). Four fields. No
 * ttsProvider, tts_model, storage_key, or content_hash. Admin surface
 * uses AdminAudioDto when the full payload is needed.
 */
export interface AudioDto {
  url: string;
  duration_seconds: number;
  voice: string;
  language_code: string;
}

export interface AdminAudioDto extends AudioDto {
  audio_id: string;
  character_count: number;
  is_stale: boolean;
  generated_at: string;
  tts_provider: string;
  tts_model: string;
  storage_key: string;
}

export type AudioReadResult =
  | { kind: "ready"; audio: AudioDto }
  | {
      kind: "queued";
      job: { job_id: string; estimated_ready_seconds: number };
    };

export interface AudioJobStatusDto {
  job_id: string;
  status: "queued" | "active" | "completed" | "failed";
  audio?: AudioDto;
  error_code?: string;
}

export class AudioService {
  private readonly repository: AudioRepository;
  private readonly providerOverride?: TtsProvider;
  private _cachedProvider?: TtsProvider;

  constructor(
    private readonly db: db,
    private readonly storage: ObjectStorageService,
    provider?: TtsProvider,
    private readonly queue: Queue<AudioGenerationJobData> = audioGenerationQueue,
    repository?: AudioRepository,
  ) {
    this.providerOverride = provider;
    this.repository = repository ?? new AudioRepository(db);
  }

  /**
   * Lazy provider accessor. Holding a live OpenAI client inside Elysia's
   * plugin state triggers a boot hang on Bun (the plugin chain never
   * continues to the next `.use(...)`). Deferring construction until
   * the first request keeps plugin init free of the SDK instance and
   * matches real access patterns — only the stub short-circuit inside
   * `getOrQueueAudio` and the worker's synthesis path need a provider.
   * Tests inject a provider explicitly (third constructor arg) and
   * bypass the factory.
   */
  private get provider(): TtsProvider {
    if (this.providerOverride) return this.providerOverride;
    this._cachedProvider ??= createTtsProvider();
    return this._cachedProvider;
  }

  async getOrQueueAudio(params: {
    explanation_id: number;
    voice?: string;
    language?: string;
    currentUserId: string | null;
  }): Promise<AudioReadResult> {
    const explanation = await this.loadExplanation(params.explanation_id);
    if (!explanation) {
      throw new NotFoundError(`Explanation ${params.explanation_id} not found`);
    }

    // br-audio-008: language follows explanation unless caller overrides.
    const language = params.language ?? explanation.language_code;
    const voice = params.voice ?? DEFAULT_VOICE_EN;

    // br-audio-013: guest scope
    if (!params.currentUserId) {
      const isGuestAllowed = await this.isGuestAllowed(explanation.chapter_id);
      if (!isGuestAllowed) {
        throw new UnauthorizedError(
          "GUEST_SCOPE_EXCEEDED: guest users can only access audio on Genesis 1",
        );
      }
    }

    const variantKey: AudioVariantKey = {
      explanation_id: explanation.explanation_id,
      voice,
      language_code: language,
    };

    // Cache hit (br-audio-002 canonical variant; br-audio-003 lazy)
    const current = await this.repository.findCurrent(variantKey);
    if (current && !current.is_stale) {
      return { kind: "ready", audio: await this.toDto(current) };
    }

    // br-audio-007: stub short-circuit — bypass queue, synthesize inline.
    if (this.provider.name === "stub") {
      const row = await this.synthesizeAndStore(
        explanation.explanation,
        variantKey,
      );
      return { kind: "ready", audio: await this.toDto(row) };
    }

    // br-audio-006: dedup via deterministic job id.
    //
    // Caveat: BullMQ's `queue.add({ jobId })` is a no-op when a job with
    // that id already exists in the queue, regardless of state. Combined
    // with `removeOnFail: 50` (we keep the last 50 failed jobs for
    // observability), a single failed job permanently blocks retries on
    // the same (explanation_id, voice, language) variant — every fresh
    // request gets the cached failed job back, the chip flips to error,
    // and the user can never recover even after the underlying problem
    // (e.g., transient OpenAI 5xx) clears. Observed on prod for Genesis
    // 1 (explanation 10170) on 2026-04-28: any guest hitting the chip
    // saw "Audio unavailable" for hours.
    //
    // Remove the failed job before re-enqueue so the new request gets a
    // fresh attempt. Completed jobs remain dedup'd as before; in-flight
    // jobs (waiting/active/delayed) still short-circuit.
    const data: AudioGenerationJobData = variantKey;
    const jobId = audioGenerationJobId(data);
    const existing = await this.queue.getJob(jobId);
    if (existing && (await existing.isFailed())) {
      await existing.remove();
    }
    const stillInFlight =
      existing &&
      !(await existing.isCompleted()) &&
      !(await existing.isFailed());
    if (!stillInFlight) {
      await this.queue.add(AUDIO_GENERATION_QUEUE, data, {
        jobId,
        removeOnComplete: { count: 100 },
        removeOnFail: 50,
      });
    }
    return {
      kind: "queued",
      job: { job_id: jobId, estimated_ready_seconds: ESTIMATED_READY_SECONDS },
    };
  }

  async getJobStatus(jobId: string): Promise<AudioJobStatusDto> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundError(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    if (state === "completed") {
      const ret = job.returnvalue as { audio_id?: string } | undefined;
      if (!ret?.audio_id) {
        return { job_id: jobId, status: "completed" };
      }
      const row = await this.repository.findById(ret.audio_id);
      if (!row) return { job_id: jobId, status: "completed" };
      return {
        job_id: jobId,
        status: "completed",
        audio: await this.toDto(row),
      };
    }
    if (state === "failed") {
      return {
        job_id: jobId,
        status: "failed",
        error_code: job.failedReason ? "GENERATION_FAILED" : "UNKNOWN",
      };
    }
    return { job_id: jobId, status: state === "active" ? "active" : "queued" };
  }

  /**
   * TASK-003 (br-audio-001, br-audio-002): called inside the same transaction
   * that replaces an explanation's text (or deactivates the old version).
   * Marks every audio row for `oldExplanationId` as stale and returns the
   * (voice, language_code) variants that existed — so the caller can, after
   * the transaction commits, enqueue fresh generation jobs for the new id.
   */
  async markStaleAndCollectVariants(
    oldExplanationId: number,
    trx: KyselyTransaction,
  ): Promise<AudioVariant[]> {
    const variants = await trx
      .selectFrom("explanation_audios")
      .select(["voice", "language_code"])
      .where("explanation_id", "=", oldExplanationId)
      .execute();

    if (variants.length === 0) return [];

    await trx
      .updateTable("explanation_audios")
      .set({ is_stale: true })
      .where("explanation_id", "=", oldExplanationId)
      .execute();

    return variants;
  }

  /**
   * TASK-003: fire-and-forget enqueue of audio-generation jobs for every
   * (voice, language_code) variant that previously existed. Uses the same
   * deterministic job id as the on-demand path (br-audio-006), so a reader
   * who hits Play between the stale-mark and the job completing receives
   * the in-flight job id — no duplicate work.
   */
  async enqueueRegenForVariants(
    newExplanationId: number,
    variants: AudioVariant[],
  ): Promise<string[]> {
    // Stub provider has no queue work to do — inline short-circuit handles it.
    if (this.provider.name === "stub") return [];

    const enqueued: string[] = [];
    for (const variant of variants) {
      const data: AudioGenerationJobData = {
        explanation_id: newExplanationId,
        voice: variant.voice,
        language_code: variant.language_code,
      };
      const jobId = audioGenerationJobId(data);
      const existing = await this.queue.getJob(jobId);
      // See getOrQueueAudio for why we drop failed jobs before re-add.
      if (existing && (await existing.isFailed())) {
        await existing.remove();
      }
      const stillInFlight =
        existing &&
        !(await existing.isCompleted()) &&
        !(await existing.isFailed());
      if (!stillInFlight) {
        await this.queue.add(AUDIO_GENERATION_QUEUE, data, {
          jobId,
          removeOnComplete: { count: 100 },
          removeOnFail: 50,
        });
      }
      enqueued.push(jobId);
    }
    return enqueued;
  }

  async synthesizeAndStore(
    text: string,
    variant: AudioVariantKey,
  ): Promise<ExplanationAudios> {
    const contentHash = contentHashOf(text);
    const output = await this.provider.synthesize({
      text,
      voice: variant.voice,
      language: variant.language_code,
      format: "mp3",
    });
    const key = storageKeyFor(variant, contentHash);
    await this.storage.putGlobalObject({
      key,
      body: output.audio,
      contentType: "audio/mpeg",
    });
    return this.repository.upsert({
      explanation_id: variant.explanation_id,
      voice: variant.voice,
      language_code: variant.language_code,
      storage_key: key,
      duration_seconds: output.duration_seconds,
      character_count: output.character_count,
      content_hash: contentHash,
      tts_provider: this.provider.name,
      tts_model: output.model_version,
      is_stale: false,
    });
  }

  private async loadExplanation(explanationId: number) {
    return this.db
      .getOrCreateConnection()
      .selectFrom("explanations")
      .select(["explanation_id", "explanation", "chapter_id", "language_code"])
      .where("explanation_id", "=", explanationId)
      .executeTakeFirst();
  }

  private async isGuestAllowed(chapterId: number): Promise<boolean> {
    const chapter = await this.db
      .getOrCreateConnection()
      .selectFrom("chapters")
      .select(["book_id", "chapter_number"])
      .where("chapter_id", "=", chapterId)
      .executeTakeFirst();
    return (
      chapter?.book_id === GUEST_ALLOWED_BOOK_ID &&
      chapter?.chapter_number === GUEST_ALLOWED_CHAPTER_NUMBER
    );
  }

  /**
   * Reader DTO — four fields only (br-audio-007). Internal admin /
   * test paths call toAdminDto for the full shape.
   */
  private async toDto(row: ExplanationAudios): Promise<AudioDto> {
    const url = await this.storage.getGlobalObjectUrl({ key: row.storage_key });
    return {
      url,
      duration_seconds: Number(row.duration_seconds),
      voice: row.voice,
      language_code: row.language_code,
    };
  }

  async toAdminDto(row: ExplanationAudios): Promise<AdminAudioDto> {
    const url = await this.storage.getGlobalObjectUrl({ key: row.storage_key });
    return {
      audio_id: row.audio_id,
      url,
      duration_seconds: Number(row.duration_seconds),
      character_count: row.character_count,
      voice: row.voice,
      language_code: row.language_code,
      is_stale: row.is_stale,
      generated_at:
        row.generated_at instanceof Date
          ? row.generated_at.toISOString()
          : new Date(row.generated_at).toISOString(),
      tts_provider: row.tts_provider,
      tts_model: row.tts_model,
      storage_key: row.storage_key,
    };
  }
}
