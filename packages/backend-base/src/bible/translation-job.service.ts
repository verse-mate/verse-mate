/**
 * Durable, resumable translation QUEUE driven by the local `claude -p`
 * transport (a Claude subscription). One `translation_jobs` row encodes a user
 * contract — "translate language X, kinds [...] over a scope" — and this
 * service computes the missing work and grinds through it sequentially,
 * persisting progress so it survives process restarts and usage-limit windows.
 *
 * The whole pipeline reuses Part A:
 *   build*Requests (skip-existing) → executeBatchRequestsViaClaude → process*OutputFile(jsonl)
 *
 * Resumability rests on one invariant: "done" is NEVER trusted from memory — it
 * is recomputed from the content tables (`explanations` / `study_translations`)
 * each pass, because the build*Requests skip-existing path queries those tables
 * directly. A restart that calls processJob(jobId) again therefore continues
 * exactly where it left off; already-written units simply become skipped.
 *
 * Byline-chunk safety: a whole book's commentary requests are built and run in
 * ONE executor + ONE writeback call, so the chunked byline custom_ids
 * (`...|chunk|i|of|n`) are always stitched back together by
 * processTranslateOutputFile. We never split a book across writeback calls.
 *
 * Single-subscription, strictly sequential. Multi-worker concurrency is a later
 * increment.
 */
import { db } from "database";
import { sql } from "kysely";
import {
  BatchOperationService,
  DEFAULT_MAX_OUTPUT_TOKENS,
} from "../admin/services/batch-operations.service";
import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import { batchProcessingQueue } from "../queue/batch-processing.queue";
import { executeBatchRequestsViaClaude } from "./claude-batch-executor";

/** Commentary explanation types we know how to translate. */
const COMMENTARY_TYPES = ["summary", "byline", "detailed"] as const;
type CommentaryType = (typeof COMMENTARY_TYPES)[number];

const DEFAULT_MODEL = "haiku";
const DEFAULT_SOURCE_LANG = "en";
const DEFAULT_PAUSE_RETRY_MS = 30 * 60_000;
const DEFAULT_EFFORT: "low" | "medium" | "high" = "low";

export type TranslationJobStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export interface CreateJobParams {
  targetLanguageCode: string;
  kinds: string[];
  scopeType: "bible" | "book";
  bookName?: string;
  chapterNumbers?: number[];
  model?: string;
  configDir?: string;
  sourceLanguageCode?: string;
}

/** A row of the translation_jobs table, as selected. */
export interface TranslationJobRow {
  job_id: string;
  target_language_code: string;
  source_language_code: string;
  kinds: string[];
  scope_type: string;
  book_name: string | null;
  chapter_numbers: number[] | null;
  model: string;
  config_dir: string | null;
  status: string;
  total_units: number;
  done_units: number;
  failed_units: number;
}

/** Per-book breakdown of the remaining (undone) work. */
export interface RemainingForBook {
  bookName: string;
  /** Commentary build requests still outstanding (one per request, byline may be chunked). */
  commentaryUnits: number;
  /** Study build requests still outstanding. */
  studyUnits: number;
}

export interface RemainingUnits {
  perBook: RemainingForBook[];
  total: number;
}

export interface ProcessJobOptions {
  /** How long to sleep before retrying the SAME book after a usage limit. */
  pauseRetryMs?: number;
  /** Optional wall-clock budget; when exceeded the loop returns leaving the job 'paused'. */
  maxRunMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Split a mixed `kinds` array into the commentary explanation types (in
 * canonical order) and whether study content is included. Pure — unit-tested.
 */
export function splitKinds(kinds: string[]): {
  commentaryTypes: CommentaryType[];
  includeStudy: boolean;
} {
  return {
    commentaryTypes: COMMENTARY_TYPES.filter((t) => kinds.includes(t)),
    includeStudy: kinds.includes("study"),
  };
}

/**
 * Aggregate per-book commentary/study request counts into the remaining-units
 * shape: drop books with no outstanding work, sum the rest. Pure — unit-tested.
 * This is the core delta computation; the DB-querying part (counting requests
 * per book via the skip-existing builders) feeds raw counts into this.
 */
export function aggregateRemaining(
  counts: Array<{
    bookName: string;
    commentaryUnits: number;
    studyUnits: number;
  }>,
): RemainingUnits {
  const perBook: RemainingForBook[] = [];
  let total = 0;
  for (const c of counts) {
    const sum = c.commentaryUnits + c.studyUnits;
    if (sum > 0) {
      perBook.push({
        bookName: c.bookName,
        commentaryUnits: c.commentaryUnits,
        studyUnits: c.studyUnits,
      });
      total += sum;
    }
  }
  return { perBook, total };
}

export class TranslationJobService {
  private readonly batch: BatchOperationService;

  constructor() {
    this.batch = new BatchOperationService(
      db,
      batchMonitoringQueue,
      batchProcessingQueue,
    );
  }

  /**
   * Books that hold commentary in the SOURCE language for the requested types.
   * Derived from the `books` table joined to active source explanations, so
   * every name is a valid `books.name` (buildBookTranslateRequests throws on an
   * unknown book name). Returns names sorted by book_id.
   */
  private async commentaryBooks(
    sourceLanguageCode: string,
    types: CommentaryType[],
    scopeType: "bible" | "book",
    bookName?: string,
  ): Promise<string[]> {
    if (types.length === 0) return [];
    if (scopeType === "book") return bookName ? [bookName] : [];

    const conn = db.getOrCreateConnection();
    const rows = await conn
      .selectFrom("books")
      .innerJoin("chapters", "chapters.book_id", "books.book_id")
      .innerJoin(
        "explanations",
        "explanations.chapter_id",
        "chapters.chapter_id",
      )
      .where("explanations.language_code", "=", sourceLanguageCode)
      .where("explanations.is_active", "=", true)
      .where("explanations.type", "in", types as never[])
      .select("books.name as name")
      .distinct()
      .orderBy(sql`min(books.book_id)` as never)
      .groupBy("books.name")
      .execute();
    return rows.map((r) => r.name).filter((n): n is string => !!n);
  }

  /**
   * Books that hold studies (keyed by `content->>'bookName'`, the
   * @versemate/studies id space — NOT the `books` table).
   */
  private async studyBooks(
    scopeType: "bible" | "book",
    bookName?: string,
  ): Promise<string[]> {
    const conn = db.getOrCreateConnection();
    if (scopeType === "book") {
      if (!bookName) return [];
      const exists = await conn
        .selectFrom("studies")
        .select(conn.fn.countAll().as("n"))
        .where(sql`content->>'bookName'`, "=", bookName)
        .executeTakeFirst();
      return Number(exists?.n ?? 0) > 0 ? [bookName] : [];
    }
    const rows = await conn
      .selectFrom("studies")
      .select(sql<string>`content->>'bookName'`.as("book_name"))
      .distinct()
      .orderBy(sql`content->>'bookName'`)
      .execute();
    return rows.map((r) => r.book_name).filter((n): n is string => !!n);
  }

  /**
   * Compute the undone work across the job's scope + kinds, organized per book
   * (so a book is processed atomically). "Undone" = the count of build requests
   * the skip-existing builders still produce (no active target-language row).
   */
  async computeRemainingUnits(job: TranslationJobRow): Promise<RemainingUnits> {
    const { commentaryTypes, includeStudy } = splitKinds(job.kinds);
    const scopeType = job.scope_type as "bible" | "book";
    const chapters = job.chapter_numbers ?? undefined;

    const commBooks = await this.commentaryBooks(
      job.source_language_code,
      commentaryTypes,
      scopeType,
      job.book_name ?? undefined,
    );
    const stdBooks = includeStudy
      ? await this.studyBooks(scopeType, job.book_name ?? undefined)
      : [];

    const commSet = new Set(commBooks);
    const stdSet = new Set(stdBooks);
    const allBooks = Array.from(new Set([...commBooks, ...stdBooks]));

    const counts: Array<{
      bookName: string;
      commentaryUnits: number;
      studyUnits: number;
    }> = [];

    for (const bookName of allBooks) {
      let commentaryUnits = 0;
      let studyUnits = 0;

      if (commentaryTypes.length > 0 && commSet.has(bookName)) {
        const reqs = await this.batch.buildBookTranslateRequests(
          job.model,
          job.source_language_code,
          job.target_language_code,
          commentaryTypes,
          bookName,
          DEFAULT_EFFORT,
          DEFAULT_MAX_OUTPUT_TOKENS,
          chapters,
          true,
        );
        commentaryUnits = reqs.length;
      }

      if (includeStudy && stdSet.has(bookName)) {
        const reqs = await this.batch.buildStudyTranslateRequests(
          job.model,
          job.target_language_code,
          DEFAULT_EFFORT,
          bookName,
          true,
          chapters,
        );
        studyUnits = reqs.length;
      }

      counts.push({ bookName, commentaryUnits, studyUnits });
    }

    return aggregateRemaining(counts);
  }

  /** Insert a new pending job, pre-computing total_units (the delta to do). */
  async createJob(params: CreateJobParams): Promise<TranslationJobRow> {
    const conn = db.getOrCreateConnection();
    const model = params.model ?? DEFAULT_MODEL;
    const sourceLanguageCode = params.sourceLanguageCode ?? DEFAULT_SOURCE_LANG;

    const inserted = await conn
      .insertInto("translation_jobs")
      .values({
        target_language_code: params.targetLanguageCode,
        source_language_code: sourceLanguageCode,
        kinds: JSON.stringify(params.kinds),
        scope_type: params.scopeType,
        book_name: params.bookName ?? null,
        chapter_numbers: params.chapterNumbers
          ? JSON.stringify(params.chapterNumbers)
          : null,
        model,
        config_dir: params.configDir ?? null,
        status: "pending",
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const job = this.normalizeRow(inserted);
    const remaining = await this.computeRemainingUnits(job);
    await conn
      .updateTable("translation_jobs")
      .set({ total_units: remaining.total, updated_at: new Date() })
      .where("job_id", "=", job.job_id)
      .execute();
    job.total_units = remaining.total;
    return job;
  }

  /** Read a job row, normalizing jsonb columns to native arrays. */
  async getJob(jobId: string): Promise<TranslationJobRow> {
    const conn = db.getOrCreateConnection();
    const row = await conn
      .selectFrom("translation_jobs")
      .selectAll()
      .where("job_id", "=", jobId)
      .executeTakeFirstOrThrow();
    return this.normalizeRow(row);
  }

  private normalizeRow(row: Record<string, unknown>): TranslationJobRow {
    const parseArr = (v: unknown): unknown[] | null => {
      if (v == null) return null;
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        try {
          const parsed = JSON.parse(v);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
      return null;
    };
    return {
      job_id: row.job_id as string,
      target_language_code: row.target_language_code as string,
      source_language_code: row.source_language_code as string,
      kinds: (parseArr(row.kinds) ?? []) as string[],
      scope_type: row.scope_type as string,
      book_name: (row.book_name as string | null) ?? null,
      chapter_numbers: parseArr(row.chapter_numbers) as number[] | null,
      model: row.model as string,
      config_dir: (row.config_dir as string | null) ?? null,
      status: row.status as string,
      total_units: Number(row.total_units ?? 0),
      done_units: Number(row.done_units ?? 0),
      failed_units: Number(row.failed_units ?? 0),
    };
  }

  private async setStatus(
    jobId: string,
    status: TranslationJobStatus,
    extra?: {
      pausedUntil?: Date | null;
      lastError?: string | null;
    },
  ): Promise<void> {
    const conn = db.getOrCreateConnection();
    await conn
      .updateTable("translation_jobs")
      .set({
        status,
        paused_until: extra?.pausedUntil ?? null,
        last_error: extra?.lastError ?? null,
        updated_at: new Date(),
      })
      .where("job_id", "=", jobId)
      .execute();
  }

  /**
   * Persist progress: recompute done = total - remaining so the numbers reflect
   * reality even across restarts, and accumulate failures.
   */
  private async persistProgress(
    jobId: string,
    totalUnits: number,
    remainingTotal: number,
    failedDelta: number,
  ): Promise<void> {
    const conn = db.getOrCreateConnection();
    const done = Math.max(0, totalUnits - remainingTotal);
    await conn
      .updateTable("translation_jobs")
      .set((eb) => ({
        done_units: done,
        failed_units: eb("failed_units", "+", failedDelta),
        updated_at: new Date(),
      }))
      .where("job_id", "=", jobId)
      .execute();
  }

  /**
   * The worker loop. Sequential, single-subscription, resumable.
   *
   * Each pass recomputes the remaining work from the DB and grinds book by
   * book. A book's commentary requests (and separately its study requests) are
   * each run in ONE executor + ONE writeback so byline chunks stay together.
   * On a usage limit we persist progress, mark 'paused', sleep pauseRetryMs and
   * retry the SAME book (the just-written units are now skipped). maxRunMs, if
   * given, lets a caller bound the run — we return leaving status 'paused' so a
   * later processJob(jobId) resumes.
   */
  async processJob(jobId: string, opts?: ProcessJobOptions): Promise<void> {
    const pauseRetryMs = opts?.pauseRetryMs ?? DEFAULT_PAUSE_RETRY_MS;
    const maxRunMs = opts?.maxRunMs;
    const startedAt = Date.now();

    const budgetExceeded = (): boolean =>
      maxRunMs != null && Date.now() - startedAt >= maxRunMs;

    try {
      const job = await this.getJob(jobId);
      const { commentaryTypes, includeStudy } = splitKinds(job.kinds);
      const chapters = job.chapter_numbers ?? undefined;
      const executorOpts = {
        model: job.model,
        configDir: job.config_dir ?? undefined,
      };

      await this.setStatus(jobId, "running");

      // Outer loop: each pass recomputes remaining; ends when nothing remains.
      // A usage-limit pause inside re-enters this loop after the sleep.
      for (;;) {
        const remaining = await this.computeRemainingUnits(job);
        // Keep total_units honest (sources may have grown since createJob).
        const totalUnits = Math.max(job.total_units, remaining.total);
        await this.persistProgress(jobId, totalUnits, remaining.total, 0);

        if (remaining.total === 0) {
          await this.setStatus(jobId, "completed");
          console.log(`[TJOB ${jobId}] completed — no remaining units.`);
          return;
        }

        for (const book of remaining.perBook) {
          if (budgetExceeded()) {
            await this.setStatus(jobId, "paused");
            console.log(
              `[TJOB ${jobId}] maxRunMs reached — pausing for a later resume.`,
            );
            return;
          }

          // --- Commentary (one executor + one writeback for the whole book) ---
          if (commentaryTypes.length > 0 && book.commentaryUnits > 0) {
            const reqs = await this.batch.buildBookTranslateRequests(
              job.model,
              job.source_language_code,
              job.target_language_code,
              commentaryTypes,
              book.bookName,
              DEFAULT_EFFORT,
              DEFAULT_MAX_OUTPUT_TOKENS,
              chapters,
              true,
            );
            if (reqs.length > 0) {
              console.log(
                `[TJOB ${jobId}] ${book.bookName}: ${reqs.length} commentary request(s) → claude…`,
              );
              const result = await executeBatchRequestsViaClaude(
                reqs,
                executorOpts,
              );
              if (result.jsonl.trim().length > 0) {
                await this.batch.processTranslateOutputFile(
                  `local-${jobId}-${book.bookName}-commentary`,
                  "",
                  { model: job.model },
                  result.jsonl,
                );
              }
              await this.recountAndPersist(job, jobId, result.failed);

              if (result.stoppedByUsageLimit) {
                await this.handleUsageLimitPause(
                  jobId,
                  pauseRetryMs,
                  budgetExceeded,
                );
                if (budgetExceeded()) return;
                break; // re-enter outer loop, re-build this book (now skipped)
              }
            }
          }

          // --- Study (separate executor + writeback) ---
          if (includeStudy && book.studyUnits > 0) {
            const reqs = await this.batch.buildStudyTranslateRequests(
              job.model,
              job.target_language_code,
              DEFAULT_EFFORT,
              book.bookName,
              true,
              chapters,
            );
            if (reqs.length > 0) {
              console.log(
                `[TJOB ${jobId}] ${book.bookName}: ${reqs.length} study request(s) → claude…`,
              );
              const result = await executeBatchRequestsViaClaude(
                reqs,
                executorOpts,
              );
              if (result.jsonl.trim().length > 0) {
                await this.batch.processStudyTranslateOutputFile(
                  `local-${jobId}-${book.bookName}-study`,
                  "",
                  { model: job.model },
                  result.jsonl,
                );
              }
              await this.recountAndPersist(job, jobId, result.failed);

              if (result.stoppedByUsageLimit) {
                await this.handleUsageLimitPause(
                  jobId,
                  pauseRetryMs,
                  budgetExceeded,
                );
                if (budgetExceeded()) return;
                break;
              }
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[TJOB ${jobId}] FAILED:`, message);
      await this.setStatus(jobId, "failed", { lastError: message });
      throw error;
    }
  }

  /** Recompute remaining from the DB and persist done/failed (resume-safe). */
  private async recountAndPersist(
    job: TranslationJobRow,
    jobId: string,
    failedDelta: number,
  ): Promise<void> {
    const remaining = await this.computeRemainingUnits(job);
    const totalUnits = Math.max(job.total_units, remaining.total);
    await this.persistProgress(jobId, totalUnits, remaining.total, failedDelta);
  }

  /**
   * Mark paused, sleep until the window clears (unless the run budget is up, in
   * which case return immediately leaving 'paused' for a later resume).
   */
  private async handleUsageLimitPause(
    jobId: string,
    pauseRetryMs: number,
    budgetExceeded: () => boolean,
  ): Promise<void> {
    const pausedUntil = new Date(Date.now() + pauseRetryMs);
    await this.setStatus(jobId, "paused", { pausedUntil });
    console.log(
      `[TJOB ${jobId}] hit usage limit — paused until ${pausedUntil.toISOString()}.`,
    );
    if (budgetExceeded()) return;
    await sleep(pauseRetryMs);
    await this.setStatus(jobId, "running");
  }
}
