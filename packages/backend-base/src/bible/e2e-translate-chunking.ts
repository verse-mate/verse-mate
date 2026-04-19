/**
 * E2E: submit a real translate batch for Psalms 119 byline (en-US → ro-RO),
 * wait for the 5 chunks to complete, verify the stitched output covers all 176
 * verses and was saved correctly.
 *
 * Assumes local DB has:
 *   - Active NASB1995 (en-US) bible version
 *   - Psalms 119 chapter at chapter_id 1060 with 176 verses
 *   - An en-US byline explanation covering all 176 verses (source)
 *   - A ro-RO byline explanation (any stub; overwritten by this run)
 */

import { db } from "database";
import { BatchOperationService } from "../admin/services/batch-operations.service";
import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import { batchProcessingQueue } from "../queue/batch-processing.queue";

const ADMIN_USER_ID = "fa248264-3aee-4c87-b0b5-a3508b1fd9b6";
const TARGET_LANGUAGE = "ro-RO";
const CHAPTER_ID = 1060;
const EXPECTED_VERSES = 176;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const connection = db.getOrCreateConnection();
  console.log("=== E2E Translate Chunking Test (en-US → ro-RO) ===\n");

  console.log("Step 1: Verify source byline exists and has 176 verses...");
  const source = await connection
    .selectFrom("explanations")
    .where("chapter_id", "=", CHAPTER_ID)
    .where("type", "=", "byline" as any)
    .where("language_code", "=", "en-US")
    .where("is_active", "=", true)
    .select(["explanation_id", "explanation"])
    .executeTakeFirst();

  if (!source) {
    throw new Error("No active en-US byline for chapter_id 1060. Aborting.");
  }

  const sourceHeadings = (
    source.explanation.match(/^## (?:Psalm|Psalms) 119:\d+/gm) || []
  ).length;
  console.log(
    `  Source explanation_id=${source.explanation_id}, ${sourceHeadings} verses, ${source.explanation.length} chars\n`,
  );
  if (sourceHeadings < EXPECTED_VERSES * 0.9) {
    throw new Error(
      `Source byline has ${sourceHeadings} verses, expected close to ${EXPECTED_VERSES}`,
    );
  }

  console.log("Step 2: Submit translate batch...");
  const service = new BatchOperationService(
    db,
    batchMonitoringQueue,
    batchProcessingQueue,
  );

  // Call the private method via auto-translate trigger path
  await service.triggerAutoTranslations(
    [{ bookId: 19, chapterNumber: 119, type: "byline" }],
    "gpt-5-mini",
    ADMIN_USER_ID,
    16000,
  );

  // Find the batch that was just created for ro-RO
  const translateBatch = await connection
    .selectFrom("batch_jobs")
    .where("batch_type", "=", "auto-translate")
    .where("book_id", "=", 19)
    .orderBy("id", "desc")
    .select(["id", "openai_batch_id", "created_at", "total_requests"])
    .limit(10)
    .execute();

  const roRoBatch = translateBatch.find(async (b) => {
    // re-query to check it targets ro-RO — translate batches don't store language directly, rely on file
    return true;
  });

  // Pick the most recent one that was just created
  const startTime = Date.now();
  const recent = translateBatch.filter(
    (b) => new Date(b.created_at as any).getTime() > startTime - 30000,
  );
  console.log(`  ${recent.length} new translate batches created`);
  for (const b of recent) {
    console.log(
      `    id=${b.id} openai=${b.openai_batch_id} total_requests=${b.total_requests}`,
    );
  }

  if (recent.length === 0) {
    throw new Error("No new translate batches created");
  }

  // Find the ro-RO batch specifically by checking input_file_id's content.
  // Simpler approach: each batch handles one language, so any recent one with
  // 5 total requests (due to chunking) is a chunked byline translation.
  const chunkedBatch = recent.find((b) => b.total_requests === 5);
  if (!chunkedBatch) {
    console.log(
      "  No chunked batch found (expected 5 requests for Psalms 119 byline)",
    );
    console.log("  Instead, total_requests values:");
    for (const b of recent) {
      console.log(`    batch ${b.id}: ${b.total_requests} requests`);
    }
    throw new Error("Translate batch was not chunked");
  }

  console.log(
    `\n  Chunked batch confirmed: id=${chunkedBatch.id}, 5 requests\n`,
  );

  console.log("Step 3: Polling for completion...");
  const pollStart = Date.now();
  const timeoutMs = 20 * 60 * 1000;
  let lastStatus = "";

  while (true) {
    if (Date.now() - pollStart > timeoutMs) {
      throw new Error("Timeout");
    }

    const job = await connection
      .selectFrom("batch_jobs")
      .where("id", "=", chunkedBatch.id)
      .select(["status", "explanations_processed"])
      .executeTakeFirst();

    const elapsed = Math.round((Date.now() - pollStart) / 1000);
    if (job && (job.status !== lastStatus || elapsed % 30 === 0)) {
      console.log(
        `  [${elapsed}s] status=${job.status}, processed=${job.explanations_processed}`,
      );
      lastStatus = job.status;
    }

    if (job?.explanations_processed) {
      console.log("  Done!");
      break;
    }

    await sleep(10000);
  }

  console.log("\nStep 4: Verify saved translation...");
  const translation = await connection
    .selectFrom("explanations")
    .where("chapter_id", "=", CHAPTER_ID)
    .where("type", "=", "byline" as any)
    .where("language_code", "=", TARGET_LANGUAGE)
    .where("is_active", "=", true)
    .select(["explanation_id", "explanation", "version"])
    .executeTakeFirst();

  if (!translation) {
    throw new Error(`No active ${TARGET_LANGUAGE} byline found`);
  }

  const headings = (
    translation.explanation.match(/^## (?:Psalm|Psalms|Psalmul) 119:\d+/gm) ||
    []
  ).length;
  const verseRefs = (
    translation.explanation.match(
      /\{verse:(?:Psalm|Psalms|Psalmul) 119:\d+\}/g,
    ) || []
  ).length;
  const summaries = (
    translation.explanation.match(/^### (?:Summary|Rezumat|Sumar)/gm) || []
  ).length;

  // Also try a language-agnostic approach: unique verse numbers mentioned
  const verseNumberSet = new Set<number>();
  for (const m of translation.explanation.matchAll(/\b119[:\-](\d{1,3})\b/g)) {
    verseNumberSet.add(Number.parseInt(m[1], 10));
  }

  console.log(`  explanation_id: ${translation.explanation_id}`);
  console.log(`  version: ${translation.version}`);
  console.log(`  length: ${translation.explanation.length} chars`);
  console.log(`  ## headings: ${headings}`);
  console.log(`  {verse:} refs: ${verseRefs}`);
  console.log(`  ### Summary sections: ${summaries}`);
  console.log(
    `  unique verse numbers 1-${EXPECTED_VERSES}: ${verseNumberSet.size}`,
  );

  const sampleMatch = translation.explanation.match(
    /## (?:Psalm|Psalms|Psalmul) 119:1\b[\s\S]{0,400}/,
  );
  if (sampleMatch) {
    console.log("\n  --- Sample (first verse) ---");
    console.log(sampleMatch[0].slice(0, 400));
    console.log("  --- end ---");
  }

  const pass =
    verseNumberSet.size >= EXPECTED_VERSES &&
    verseRefs >= EXPECTED_VERSES * 0.9;

  console.log("\n=== Results ===");
  console.log(`  Verses covered: ${verseNumberSet.size}/${EXPECTED_VERSES}`);
  console.log(
    `  Status: ${pass ? "PASS" : "FAIL"}${pass ? "" : " — translation appears truncated"}`,
  );

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
