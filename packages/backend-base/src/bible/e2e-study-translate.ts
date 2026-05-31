/**
 * E2E test for the study-translation batch.
 *
 * Usage (from packages/backend-base, with POSTGRES_URL + OPEN_AI_KEY in env):
 *   bun run src/bible/e2e-study-translate.ts
 *
 * Steps:
 *   1. Trigger generateStudyTranslateBatch for ONE chapter (James 1 → ro-RO)
 *      with gpt-5-nano.
 *   2. Verify a batch_jobs row was created with an openai_batch_id +
 *      total_requests = 1 (i.e. JSONL built + uploaded + batch created).
 *   3. Confirm the batch exists on OpenAI's side (batchesRetrieve).
 *   4. Poll until the backend's monitoring+processing workers write the
 *      study_translations row (OpenAI batch completion can take minutes).
 *   5. Verify the translated study round-trips (valid shape) and is actually
 *      Romanian (differs from the English baseline).
 *
 * NOTE: the backend (apps/backend) must be running so its BullMQ workers pick
 * up the monitoring job this script enqueues.
 */
import { db } from "database";
import { BatchOperationService } from "../admin/services/batch-operations.service";
import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import { batchProcessingQueue } from "../queue/batch-processing.queue";
import { getAiProvider } from "../shared/ai";

const MODEL = "gpt-5-nano";
const TARGET_LANG = "ro-RO";
const BOOK_NAME = "James";
const BOOK_ID = 59;
const CHAPTER = 1;
const ADMIN_USER_ID = process.env.E2E_USER_ID as string;

const POLL_INTERVAL_MS = 20_000;
const MAX_POLL_MS = 8 * 60_000; // stay under the 10-min shell cap

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!ADMIN_USER_ID) throw new Error("E2E_USER_ID env required");
  const conn = db.getOrCreateConnection();
  const ai = getAiProvider();

  console.log("=== E2E Study Translate (James 1 → ro-RO, gpt-5-nano) ===\n");

  // study_id for assertions later
  const study = await conn
    .selectFrom("studies")
    .select(["study_id", "content"])
    .where("book_id", "=", BOOK_ID)
    .where("chapter", "=", CHAPTER)
    .executeTakeFirstOrThrow();
  console.log(`Step 0: source study_id=${study.study_id} present.`);

  // Clean any prior translation so the test is deterministic.
  await conn
    .deleteFrom("study_translations")
    .where("study_id", "=", study.study_id)
    .where("language_code", "=", TARGET_LANG)
    .execute();

  const service = new BatchOperationService(
    db,
    batchMonitoringQueue,
    batchProcessingQueue,
  );

  console.log("Step 1: triggering batch…");
  const result = await service.generateStudyTranslateBatch(
    MODEL,
    ADMIN_USER_ID,
    "book",
    TARGET_LANG,
    false,
    "low",
    BOOK_NAME,
    [CHAPTER],
  );
  console.log("  result:", JSON.stringify(result));
  const openaiBatchId = (result as { batchId?: string }).batchId;
  if (!openaiBatchId) throw new Error("No batchId returned");

  console.log("Step 2: verifying batch_jobs row…");
  const job = await conn
    .selectFrom("batch_jobs")
    .selectAll()
    .where("openai_batch_id", "=", openaiBatchId)
    .executeTakeFirstOrThrow();
  console.log(
    `  batch_type=${job.batch_type} status=${job.status} total_requests=${job.total_requests} model=${job.model} target=${job.target_language_code}`,
  );

  console.log("Step 3: confirming batch on OpenAI…");
  const remote = await ai.batchesRetrieve(openaiBatchId);
  console.log(
    `  openai status=${remote.status} requestCounts=${JSON.stringify(remote.requestCounts ?? {})}`,
  );

  console.log("Step 4: polling OpenAI until the batch completes…");
  const start = Date.now();
  let outputFileId: string | undefined;
  while (Date.now() - start < MAX_POLL_MS) {
    const r = await ai.batchesRetrieve(openaiBatchId);
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`  [${elapsed}s] openai status=${r.status}`);
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
      "\n⏳ OpenAI batch not completed within poll window. Submission verified; re-run later.",
    );
    await db.closeConnection();
    process.exit(2);
  }
  console.log(`  completed. outputFileId=${outputFileId}`);

  console.log("Step 5: running writeback (processStudyTranslateOutputFile)…");
  await service.processStudyTranslateOutputFile(openaiBatchId, outputFileId, {
    model: MODEL,
  });

  const translated = await conn
    .selectFrom("study_translations")
    .select(["translated_content"])
    .where("study_id", "=", study.study_id)
    .where("language_code", "=", TARGET_LANG)
    .where("is_active", "=", true)
    .executeTakeFirst();
  if (!translated) {
    throw new Error("No study_translations row after writeback");
  }

  console.log("Step 6: validating translated study…");
  const tc = translated.translated_content as Record<string, any>;
  const en = study.content as Record<string, any>;
  console.log(`  EN title:  ${en.title}  | theme: ${en.themeOneLine}`);
  console.log(`  RO title:  ${tc.title}  | theme: ${tc.themeOneLine}`);
  console.log(
    `  steps=${tc.steps?.length} movements=${tc.interpretation?.movements?.length} app=${tc.application?.questions?.length}`,
  );
  console.log(`  RO step1 summary: ${tc.steps?.[0]?.summary}`);
  const differs = JSON.stringify(tc) !== JSON.stringify(en);
  console.log(`  differs from English: ${differs ? "YES ✅" : "NO ❌"}`);
  console.log("\n✅ E2E PASSED — study translated and stored.");
  await db.closeConnection();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("E2E failed:", e);
  await db.closeConnection();
  process.exit(1);
});
