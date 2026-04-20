import type { Queue } from "bullmq";
import type { ExplanationAudios } from "database/src/models/public/ExplanationAudios";
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

export interface AudioDto {
  audio_id: string;
  url: string;
  duration_seconds: number;
  character_count: number;
  voice: string;
  language_code: string;
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

  constructor(
    private readonly db: db,
    private readonly storage: ObjectStorageService,
    private readonly provider: TtsProvider = createTtsProvider(),
    private readonly queue: Queue<AudioGenerationJobData> = audioGenerationQueue,
    repository?: AudioRepository,
  ) {
    this.repository = repository ?? new AudioRepository(db);
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
    const data: AudioGenerationJobData = variantKey;
    const jobId = audioGenerationJobId(data);
    const existing = await this.queue.getJob(jobId);
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

  private async toDto(row: ExplanationAudios): Promise<AudioDto> {
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
