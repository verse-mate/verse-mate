/**
 * CLI runner for the resumable local-`claude -p` translation QUEUE.
 *
 * Creates a translation_jobs row for the given contract and runs it to
 * completion (or until paused by a usage-limit window / run budget), reusing
 * Part A's build → execute → writeback pipeline via TranslationJobService.
 *
 * Usage (from packages/backend-base, with POSTGRES_URL; runs where the `claude`
 * CLI + the chosen subscription login live — i.e. the Pi):
 *   TARGET_LANG=fr KINDS="summary,byline,study" SCOPE=book BOOK_NAME=James \
 *   bun run src/bible/run-translation-job.ts
 *
 * Env:
 *   TARGET_LANG                 (required, e.g. fr)
 *   KINDS                       (comma list of summary|byline|detailed|study)
 *   SCOPE                       (bible|book, default book)
 *   BOOK_NAME                   (required when SCOPE=book)
 *   CHAPTERS                    (optional comma ints, e.g. "1,2")
 *   CLAUDE_MODEL                (default haiku)
 *   CLAUDE_CONFIG_DIR_TRANSLATE (optional → job.config_dir)
 *   SOURCE_LANG                 (default en)
 *   PAUSE_RETRY_MS              (optional sleep before retrying after a limit)
 *   MAX_RUN_MS                  (optional run budget; returns paused when hit)
 *
 * Exit codes: 0 completed, 2 still paused (resume later), 1 error.
 */
import { db } from "database";
import { TranslationJobService } from "./translation-job.service";

const TARGET_LANG = process.env.TARGET_LANG;
const KINDS = (process.env.KINDS || "")
  .split(",")
  .map((k) => k.trim())
  .filter((k) => k.length > 0);
const SCOPE = (process.env.SCOPE as "bible" | "book") || "book";
const BOOK_NAME = process.env.BOOK_NAME || undefined;
const CHAPTERS = process.env.CHAPTERS
  ? process.env.CHAPTERS.split(",").map((c) => Number.parseInt(c.trim(), 10))
  : undefined;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "haiku";
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR_TRANSLATE || undefined;
const SOURCE_LANG = process.env.SOURCE_LANG || "en-US";
const PAUSE_RETRY_MS = process.env.PAUSE_RETRY_MS
  ? Number(process.env.PAUSE_RETRY_MS)
  : undefined;
const MAX_RUN_MS = process.env.MAX_RUN_MS
  ? Number(process.env.MAX_RUN_MS)
  : undefined;

async function main() {
  if (!TARGET_LANG) throw new Error("TARGET_LANG env required");
  if (KINDS.length === 0) throw new Error("KINDS env required (comma list)");
  if (SCOPE === "book" && !BOOK_NAME) {
    throw new Error("BOOK_NAME env required when SCOPE=book");
  }

  db.getOrCreateConnection();

  console.log(
    `=== Translation job: ${TARGET_LANG} | kinds=[${KINDS.join(
      ",",
    )}] | scope=${SCOPE}${BOOK_NAME ? ` (${BOOK_NAME})` : ""}${
      CHAPTERS ? ` chapters=${CHAPTERS.join(",")}` : ""
    } | ${CLAUDE_MODEL} ===\n`,
  );

  const service = new TranslationJobService();

  const job = await service.createJob({
    targetLanguageCode: TARGET_LANG,
    kinds: KINDS,
    scopeType: SCOPE,
    bookName: BOOK_NAME,
    chapterNumbers: CHAPTERS,
    model: CLAUDE_MODEL,
    configDir: CONFIG_DIR,
    sourceLanguageCode: SOURCE_LANG,
  });

  console.log(
    `Created job ${job.job_id} — ${job.total_units} unit(s) to translate.\n`,
  );

  if (job.total_units === 0) {
    console.log("Nothing to translate. Done.");
    await db.closeConnection();
    process.exit(0);
  }

  await service.processJob(job.job_id, {
    pauseRetryMs: PAUSE_RETRY_MS,
    maxRunMs: MAX_RUN_MS,
  });

  const final = await service.getJob(job.job_id);
  console.log(
    `\n=== status=${final.status} done=${final.done_units}/${final.total_units} failed=${final.failed_units} ===`,
  );

  await db.closeConnection();
  if (final.status === "completed") process.exit(0);
  // Paused (usage-limit window not cleared within the run budget) — resume later.
  process.exit(2);
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await db.closeConnection();
  process.exit(1);
});
