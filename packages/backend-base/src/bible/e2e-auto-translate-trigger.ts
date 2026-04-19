/**
 * E2E test: Verify auto-translation triggers after a regenerate-book batch.
 *
 * Usage:
 *   cd packages/backend-base && bun run src/bible/e2e-auto-translate-trigger.ts
 *
 * This script:
 *   1. Confirms local DB has translations in multiple languages for Psalms 119
 *   2. Triggers a regenerate-book batch for Psalms 119 byline
 *   3. Polls until batch completes
 *   4. Watches batch_jobs table for new auto-translate translation batches
 *   5. Reports whether auto-translation actually triggered
 */

import { db } from "database";
import { BatchOperationService } from "../admin/services/batch-operations.service";
import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import { batchProcessingQueue } from "../queue/batch-processing.queue";

const BOOK_NAME = "Psalms";
const CHAPTER_NUMBER = 119;
const EXPLANATION_TYPE = "byline";
const MODEL = "gpt-5-mini";
const BIBLE_VERSION = "NASB1995";
const ADMIN_USER_ID = "fa248264-3aee-4c87-b0b5-a3508b1fd9b6";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const connection = db.getOrCreateConnection();
  console.log("=== E2E Auto-Translate Trigger Test ===\n");

  // Step 1: Verify pre-conditions
  console.log("Step 1: Checking pre-conditions...");

  const existingTranslations = await connection
    .selectFrom("explanations")
    .innerJoin("chapters", "chapters.chapter_id", "explanations.chapter_id")
    .where("chapters.book_id", "=", 19)
    .where("chapters.chapter_number", "=", CHAPTER_NUMBER)
    .where("explanations.type", "=", EXPLANATION_TYPE as any)
    .where("explanations.is_active", "=", true)
    .select(["explanations.language_code"])
    .groupBy("explanations.language_code")
    .execute();

  console.log(
    `  Active byline languages for ${BOOK_NAME} ${CHAPTER_NUMBER}: ${existingTranslations
      .map((t) => t.language_code)
      .join(", ")}`,
  );

  const nonEnglishLangs = existingTranslations.filter(
    (t) => !t.language_code.startsWith("en"),
  );
  if (nonEnglishLangs.length === 0) {
    throw new Error(
      "No non-English translations exist — cannot test auto-translation",
    );
  }
  console.log(
    `  Non-English targets: ${nonEnglishLangs.map((t) => t.language_code).join(", ")}\n`,
  );

  // Step 2: Capture pre-batch state
  const preBatchCount = await connection
    .selectFrom("batch_jobs")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  console.log(`Step 2: Pre-batch job count: ${preBatchCount.count}\n`);

  // Step 3: Trigger regenerate-book batch
  console.log("Step 3: Triggering regenerate-book batch...");
  const batchService = new BatchOperationService(
    db,
    batchMonitoringQueue,
    batchProcessingQueue,
  );

  const batch = await batchService.generateBookBatchByName(
    BOOK_NAME,
    BIBLE_VERSION,
    [EXPLANATION_TYPE as any],
    MODEL,
    ADMIN_USER_ID,
    false, // skipExisting
    "medium",
    [CHAPTER_NUMBER],
    16000, // maxOutputTokens
    "regenerate-book", // batchType
  );

  console.log(`  Batch created: ${batch.id}`);
  console.log(`  Status: ${batch.status}\n`);

  // Step 4: Poll for batch completion
  console.log("Step 4: Polling for batch completion...");
  const startTime = Date.now();
  const timeoutMs = 20 * 60 * 1000; // 20 min

  while (true) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Timeout waiting for batch completion");
    }

    const job = await connection
      .selectFrom("batch_jobs")
      .where("openai_batch_id", "=", batch.id)
      .select(["status", "explanations_processed"])
      .executeTakeFirst();

    if (!job) {
      console.log(`  [${elapsed}s] batch_jobs row not yet inserted...`);
      await sleep(5000);
      continue;
    }

    process.stdout.write(
      `\r  [${elapsed}s] status=${job.status}, processed=${job.explanations_processed}          `,
    );

    if (job.explanations_processed && job.status !== "validating") {
      console.log("\n  Batch processed!");
      break;
    }

    await sleep(10000);
  }

  // Step 5: Look for new translation batches
  console.log("\nStep 5: Checking for new translation batches...");
  await sleep(3000); // give the trigger a moment

  const postBatchJobs = await connection
    .selectFrom("batch_jobs")
    .where("created_at", ">=", new Date(startTime) as any)
    .select([
      "id",
      "batch_type",
      "status",
      "openai_batch_id",
      "parent_batch_id",
    ])
    .orderBy("id", "asc")
    .execute();

  console.log(`  Found ${postBatchJobs.length} batch jobs since test start:`);
  for (const j of postBatchJobs) {
    console.log(
      `    id=${j.id} type=${j.batch_type} status=${j.status} parent=${j.parent_batch_id} openai=${j.openai_batch_id}`,
    );
  }

  const translateBatches = postBatchJobs.filter(
    (j) => j.batch_type === "auto-translate",
  );

  // Summary
  console.log("\n=== Results ===");
  console.log(`  Source batch: ${batch.id}`);
  console.log(
    `  Expected translation batches: ${nonEnglishLangs.length} (one per non-English language)`,
  );
  console.log(`  Actual translation batches: ${translateBatches.length}`);
  console.log(
    `  Languages: ${translateBatches.map((j) => j.openai_batch_id).join(", ") || "none"}`,
  );

  const pass = translateBatches.length === nonEnglishLangs.length;
  console.log(`  Status: ${pass ? "PASS" : "FAIL"}`);

  db.closeConnection();
  batchMonitoringQueue.close();
  batchProcessingQueue.close();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  db.closeConnection();
  batchMonitoringQueue.close();
  batchProcessingQueue.close();
  process.exit(1);
});
