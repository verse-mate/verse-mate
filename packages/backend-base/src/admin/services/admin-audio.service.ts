import { randomUUID } from "node:crypto";
import type { Queue } from "bullmq";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import {
  AUDIO_GENERATION_QUEUE,
  type AudioGenerationJobData,
  audioGenerationJobId,
  audioGenerationQueue,
} from "../../bible/audio/audio-generation.queue";
import { AudioRepository } from "../../bible/audio/audio.repository";
import { NotFoundError } from "../../common/errors";
import type { db } from "../../shared/shared.plugin";

export type AdminAudioStatus = "current" | "stale" | "missing" | "failed";

export interface AdminAudioRow {
  audio_id: string | null;
  explanation_id: number;
  chapter_id: number;
  book_id: number;
  chapter_number: number;
  explanation_type: string;
  language_code: string;
  voice: string | null;
  duration_seconds: number | null;
  generated_at: string | null;
  tts_provider: string | null;
  tts_model: string | null;
  content_hash: string | null;
  storage_key: string | null;
  status: AdminAudioStatus;
}

export interface ListAudiosFilters {
  language?: string;
  voice?: string;
  isStale?: boolean;
  chapterId?: number;
  type?: ExplanationTypeEnum;
  versionKey?: string;
  limit?: number;
  offset?: number;
}

export interface BulkRegenerateInput {
  explanationIds?: number[];
  filters?: {
    bookId?: number;
    chapterNumber?: number;
    type?: ExplanationTypeEnum;
    versionKey?: string;
    languageCode?: string;
  };
  voice?: string;
  language?: string;
}

const DEFAULT_VOICE_EN = process.env.TTS_VOICE_EN ?? "alloy";

/**
 * TASK-006 admin surface for the audio feature. Lives inside the admin
 * plugin so every endpoint is covered by the existing adminGuard; the
 * service here is pure business logic that can be tested in isolation.
 */
export class AdminAudioService {
  private readonly repository: AudioRepository;

  constructor(
    private readonly db: db,
    private readonly queue: Queue<AudioGenerationJobData> = audioGenerationQueue,
  ) {
    this.repository = new AudioRepository(db);
  }

  async bulkRegenerate(
    input: BulkRegenerateInput,
  ): Promise<{ batch_id: string; job_count: number }> {
    const ids = await this.resolveExplanationIds(input);
    const batch_id = `audio-regen-${randomUUID()}`;

    if (ids.length === 0) {
      return { batch_id, job_count: 0 };
    }

    // Resolve the target voice + language per explanation. If the caller
    // specified voice/language, use those for every job. Otherwise each
    // explanation's language_code wins and voice defaults to the env.
    const explanations = await this.db
      .getOrCreateConnection()
      .selectFrom("explanations")
      .select(["explanation_id", "language_code"])
      .where("explanation_id", "in", ids)
      .execute();

    let queued = 0;
    for (const explanation of explanations) {
      const data: AudioGenerationJobData = {
        explanation_id: explanation.explanation_id,
        voice: input.voice ?? DEFAULT_VOICE_EN,
        language_code: input.language ?? explanation.language_code,
      };
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
        queued += 1;
      }
    }
    return { batch_id, job_count: queued };
  }

  async listAudios(
    filters: ListAudiosFilters = {},
  ): Promise<{ rows: AdminAudioRow[]; total: number }> {
    const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
    const offset = Math.max(0, filters.offset ?? 0);

    let query = this.db
      .getOrCreateConnection()
      .selectFrom("explanations as e")
      .innerJoin("chapters as c", "e.chapter_id", "c.chapter_id")
      .leftJoin(
        (eb) => eb.selectFrom("explanation_audios").selectAll().as("a"),
        (join) => join.onRef("a.explanation_id", "=", "e.explanation_id"),
      )
      .where("e.is_active", "=", true);

    if (filters.language)
      query = query.where("e.language_code", "=", filters.language);
    if (filters.type) query = query.where("e.type", "=", filters.type);
    if (filters.chapterId)
      query = query.where("c.chapter_id", "=", filters.chapterId);
    if (filters.voice) query = query.where("a.voice", "=", filters.voice);
    if (filters.isStale !== undefined) {
      query = query.where("a.is_stale", "=", filters.isStale);
    }

    const total = Number(
      (
        await query
          .select((eb) => eb.fn.count<number>("e.explanation_id").as("total"))
          .executeTakeFirstOrThrow()
      ).total,
    );

    const rows = await query
      .select([
        "a.audio_id",
        "e.explanation_id",
        "c.chapter_id",
        "c.book_id",
        "c.chapter_number",
        "e.type as explanation_type",
        "e.language_code",
        "a.voice",
        "a.duration_seconds",
        "a.generated_at",
        "a.tts_provider",
        "a.tts_model",
        "a.content_hash",
        "a.storage_key",
        "a.is_stale",
      ])
      .orderBy("c.book_id")
      .orderBy("c.chapter_number")
      .orderBy("e.type")
      .limit(limit)
      .offset(offset)
      .execute();

    return {
      rows: rows.map((r) => ({
        audio_id: r.audio_id,
        explanation_id: r.explanation_id,
        chapter_id: r.chapter_id,
        book_id: r.book_id,
        chapter_number: r.chapter_number,
        explanation_type: String(r.explanation_type),
        language_code: r.language_code,
        voice: r.voice,
        duration_seconds:
          r.duration_seconds === null ? null : Number(r.duration_seconds),
        generated_at: r.generated_at
          ? new Date(r.generated_at).toISOString()
          : null,
        tts_provider: r.tts_provider,
        tts_model: r.tts_model,
        content_hash: r.content_hash,
        storage_key: r.storage_key,
        status: this.statusOf(r.audio_id, r.is_stale),
      })),
      total,
    };
  }

  async getAudio(audioId: string): Promise<AdminAudioRow> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("explanation_audios as a")
      .innerJoin("explanations as e", "e.explanation_id", "a.explanation_id")
      .innerJoin("chapters as c", "e.chapter_id", "c.chapter_id")
      .select([
        "a.audio_id",
        "a.explanation_id",
        "c.chapter_id",
        "c.book_id",
        "c.chapter_number",
        "e.type as explanation_type",
        "e.language_code",
        "a.voice",
        "a.duration_seconds",
        "a.generated_at",
        "a.tts_provider",
        "a.tts_model",
        "a.content_hash",
        "a.storage_key",
        "a.is_stale",
      ])
      .where("a.audio_id", "=", audioId)
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError(`Audio ${audioId} not found`);
    }

    return {
      audio_id: row.audio_id,
      explanation_id: row.explanation_id,
      chapter_id: row.chapter_id,
      book_id: row.book_id,
      chapter_number: row.chapter_number,
      explanation_type: String(row.explanation_type),
      language_code: row.language_code,
      voice: row.voice,
      duration_seconds:
        row.duration_seconds === null ? null : Number(row.duration_seconds),
      generated_at: row.generated_at
        ? new Date(row.generated_at).toISOString()
        : null,
      tts_provider: row.tts_provider,
      tts_model: row.tts_model,
      content_hash: row.content_hash,
      storage_key: row.storage_key,
      status: this.statusOf(row.audio_id, row.is_stale),
    };
  }

  /**
   * Soft delete — mark stale. The daily cleanup worker (TASK-004) is the
   * one that actually removes the S3 object and DB row once the stale
   * window passes, so this endpoint stays constant-time.
   */
  async markStale(audioId: string): Promise<void> {
    const row = await this.repository.findById(audioId);
    if (!row) throw new NotFoundError(`Audio ${audioId} not found`);
    await this.db
      .getOrCreateConnection()
      .updateTable("explanation_audios")
      .set({ is_stale: true })
      .where("audio_id", "=", audioId)
      .execute();
  }

  private statusOf(
    audioId: string | null,
    isStale: boolean | null,
  ): AdminAudioStatus {
    if (!audioId) return "missing";
    if (isStale) return "stale";
    return "current";
    // "failed" is reserved for a future state emitted by the worker when
    // the job's failed state is surfaced to the admin table.
  }

  private async resolveExplanationIds(
    input: BulkRegenerateInput,
  ): Promise<number[]> {
    if (input.explanationIds && input.explanationIds.length > 0) {
      return [...new Set(input.explanationIds)];
    }

    const filters = input.filters ?? {};
    let query = this.db
      .getOrCreateConnection()
      .selectFrom("explanations as e")
      .innerJoin("chapters as c", "e.chapter_id", "c.chapter_id")
      .where("e.is_active", "=", true)
      .select("e.explanation_id");

    if (filters.bookId) query = query.where("c.book_id", "=", filters.bookId);
    if (filters.chapterNumber !== undefined)
      query = query.where("c.chapter_number", "=", filters.chapterNumber);
    if (filters.type) query = query.where("e.type", "=", filters.type);
    if (filters.languageCode)
      query = query.where("e.language_code", "=", filters.languageCode);

    const rows = await query.execute();
    return rows.map((r) => r.explanation_id);
  }
}
