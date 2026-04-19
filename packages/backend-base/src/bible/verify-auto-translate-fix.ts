/**
 * Quick verification: call triggerAutoTranslations directly with Psalms 119 byline
 * to confirm the hardcoded-"en" source fix works without re-submitting a full batch.
 *
 * Usage:
 *   cd packages/backend-base && bun run src/bible/verify-auto-translate-fix.ts
 */

import { db } from "database";
import { BatchOperationService } from "../admin/services/batch-operations.service";
import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import { batchProcessingQueue } from "../queue/batch-processing.queue";

const ADMIN_USER_ID = "fa248264-3aee-4c87-b0b5-a3508b1fd9b6";

async function main() {
  const connection = db.getOrCreateConnection();
  console.log("=== Verify Auto-Translate Fix ===\n");

  const beforeBatches = await connection
    .selectFrom("batch_jobs")
    .where("batch_type", "=", "auto-translate")
    .select(["id"])
    .execute();
  console.log(`Pre-call auto-translate batches: ${beforeBatches.length}\n`);

  const batchService = new BatchOperationService(
    db,
    batchMonitoringQueue,
    batchProcessingQueue,
  );

  console.log("Calling triggerAutoTranslations for Psalms 119 byline...\n");
  await batchService.triggerAutoTranslations(
    [{ bookId: 19, chapterNumber: 119, type: "byline" }],
    "gpt-5-mini",
    ADMIN_USER_ID,
    16000,
  );

  console.log("\nChecking resulting batches...");
  const afterBatches = await connection
    .selectFrom("batch_jobs")
    .where("batch_type", "=", "auto-translate")
    .select([
      "id",
      "batch_type",
      "status",
      "openai_batch_id",
      "book_id",
      "bible_version",
    ])
    .orderBy("id", "desc")
    .limit(10)
    .execute();

  const newCount = afterBatches.length - beforeBatches.length;
  console.log(`\nNew auto-translate batches created: ${newCount}`);
  for (const b of afterBatches.slice(0, newCount > 0 ? newCount : 5)) {
    console.log(
      `  id=${b.id} type=${b.batch_type} status=${b.status} openai=${b.openai_batch_id}`,
    );
  }

  db.closeConnection();
  batchMonitoringQueue.close();
  batchProcessingQueue.close();
  process.exit(newCount > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  db.closeConnection();
  batchMonitoringQueue.close();
  batchProcessingQueue.close();
  process.exit(1);
});
