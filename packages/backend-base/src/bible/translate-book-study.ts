/**
 * Translate ALL studies of one book into a target language, in a single batch.
 *
 * Generalized from e2e-study-translate.ts: whole-book (no chapter hardcode),
 * model/effort/lang/book via env. Upserts (overwrites) existing rows.
 *
 * Usage (from packages/backend-base, with POSTGRES_URL + OPEN_AI_KEY + REDIS_URL):
 *   E2E_USER_ID=... E2E_MODEL=gpt-5.4-nano-2026-03-17 E2E_EFFORT=high \
 *   BOOK_NAME=James TARGET_LANG=pt-BR \
 *   bun run src/bible/translate-book-study.ts
 *
 * Optional: CHAPTERS="1,2" to restrict; omit for the whole book.
 */
import { db } from "database";
import { sql } from "kysely";
import { BatchOperationService } from "../admin/services/batch-operations.service";
import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import { batchProcessingQueue } from "../queue/batch-processing.queue";
import { getAiProvider } from "../shared/ai";

const MODEL = process.env.E2E_MODEL || "gpt-5.4-nano-2026-03-17";
const EFFORT = (process.env.E2E_EFFORT as "low" | "medium" | "high") || "high";
const TARGET_LANG = process.env.TARGET_LANG || "pt-BR";
const BOOK_NAME = process.env.BOOK_NAME || "James";
const ADMIN_USER_ID = process.env.E2E_USER_ID as string;
const CHAPTERS = process.env.CHAPTERS
  ? process.env.CHAPTERS.split(",").map((c) => Number.parseInt(c.trim(), 10))
  : undefined;

const POLL_INTERVAL_MS = 20_000;
const MAX_POLL_MS = (Number(process.env.POLL_MINUTES) || 9) * 60_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!ADMIN_USER_ID) throw new Error("E2E_USER_ID env required");
  const conn = db.getOrCreateConnection();
  const ai = getAiProvider();

  console.log(
    `=== Translate book study: ${BOOK_NAME} → ${TARGET_LANG} | ${MODEL} @ ${EFFORT}${
      CHAPTERS ? ` | chapters ${CHAPTERS.join(",")}` : " | ALL chapters"
    } ===\n`,
  );

  // How many source chapters exist for this book? Select by the book name in
  // the study content (same convention as createStudyTranslateBatch — studies
  // are keyed by the canonical id space, NOT the books table).
  const sources = await conn
    .selectFrom("studies")
    .select(["study_id", "chapter"])
    .where(sql`content->>'bookName'`, "=", BOOK_NAME)
    .execute();
  console.log(
    `Source chapters present for ${BOOK_NAME}: ${sources
      .map((s) => s.chapter)
      .sort((a, b) => a - b)
      .join(", ")}  (count=${sources.length})`,
  );

  const service = new BatchOperationService(
    db,
    batchMonitoringQueue,
    batchProcessingQueue,
  );

  console.log("Triggering batch…");
  const result = await service.generateStudyTranslateBatch(
    MODEL,
    ADMIN_USER_ID,
    "book",
    TARGET_LANG,
    false, // skipExisting=false → overwrite
    EFFORT,
    BOOK_NAME,
    CHAPTERS,
  );
  console.log("  result:", JSON.stringify(result));
  const openaiBatchId = (result as { batchId?: string }).batchId;
  if (!openaiBatchId) throw new Error("No batchId returned (nothing to do?)");

  const job = await conn
    .selectFrom("batch_jobs")
    .selectAll()
    .where("openai_batch_id", "=", openaiBatchId)
    .executeTakeFirstOrThrow();
  console.log(
    `  batch_jobs: type=${job.batch_type} total_requests=${job.total_requests} model=${job.model} target=${job.target_language_code}`,
  );

  console.log("Polling OpenAI until completion…");
  const start = Date.now();
  let outputFileId: string | undefined;
  while (Date.now() - start < MAX_POLL_MS) {
    const r = await ai.batchesRetrieve(openaiBatchId);
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(
      `  [${elapsed}s] status=${r.status} counts=${JSON.stringify(r.requestCounts ?? {})}`,
    );
    if (r.status === "completed" && r.outputFileId) {
      outputFileId = r.outputFileId;
      break;
    }
    if (["failed", "cancelled", "expired"].includes(r.status)) {
      throw new Error(`OpenAI batch ${r.status}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (!outputFileId) {
    console.log(
      `\n⏳ Not completed within ${MAX_POLL_MS / 60000}m. Submission verified (batch ${openaiBatchId}); re-run the writeback later.`,
    );
    await db.closeConnection();
    process.exit(2);
  }

  console.log("Writeback (processStudyTranslateOutputFile)…");
  await service.processStudyTranslateOutputFile(openaiBatchId, outputFileId, {
    model: MODEL,
  });

  // Verify per chapter
  const rows = await conn
    .selectFrom("study_translations as t")
    .innerJoin("studies as s", "s.study_id", "t.study_id")
    .select(["s.chapter", "t.translated_content", "t.source"])
    .where("t.language_code", "=", TARGET_LANG)
    .where(
      "s.study_id",
      "in",
      sources.map((s) => s.study_id),
    )
    .where("t.is_active", "=", true)
    .execute();
  rows.sort((a, b) => a.chapter - b.chapter);
  console.log(`\nStored ${rows.length}/${sources.length} ${TARGET_LANG} rows:`);
  for (const r of rows) {
    const tc = r.translated_content as {
      title?: string;
      themeOneLine?: string;
    };
    console.log(
      `  ch ${r.chapter}: "${tc.title}" — ${(tc.themeOneLine || "").slice(0, 80)}  [${r.source}]`,
    );
  }
  if (rows.length < sources.length) {
    console.log(
      "⚠️  Some chapters missing a translation row — check errors above.",
    );
  }
  console.log("\n✅ DONE.");
  await db.closeConnection();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await db.closeConnection();
  process.exit(1);
});
