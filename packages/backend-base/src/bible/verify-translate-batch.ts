/**
 * Poll an existing translate batch until it completes, then verify the
 * stitched translation covers all 176 verses of Psalms 119.
 *
 * Usage: bun run src/bible/verify-translate-batch.ts <batch_jobs.id>
 */

import { db } from "database";

const CHAPTER_ID = 1060;
const TARGET_LANGUAGE = "ro-RO";
const EXPECTED_VERSES = 176;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const batchJobId = Number(process.argv[2]);
  if (!batchJobId) {
    throw new Error("Usage: verify-translate-batch.ts <batch_jobs.id>");
  }

  const connection = db.getOrCreateConnection();
  console.log(`=== Verifying translate batch_jobs.id=${batchJobId} ===\n`);

  console.log("Polling until explanations_processed=true...");
  const startTime = Date.now();
  const timeoutMs = 20 * 60 * 1000;
  let lastStatus = "";

  while (true) {
    if (Date.now() - startTime > timeoutMs) throw new Error("Timeout");

    const job = await connection
      .selectFrom("batch_jobs")
      .where("id", "=", batchJobId)
      .select([
        "status",
        "explanations_processed",
        "completed_requests",
        "failed_requests",
        "total_requests",
      ])
      .executeTakeFirst();

    if (!job) throw new Error(`Batch job ${batchJobId} not found`);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (job.status !== lastStatus || elapsed % 30 === 0) {
      console.log(
        `  [${elapsed}s] ${job.status} processed=${job.explanations_processed} (${job.completed_requests}/${job.total_requests} completed, ${job.failed_requests} failed)`,
      );
      lastStatus = job.status;
    }

    if (job.explanations_processed) break;
    await sleep(10000);
  }

  console.log("\nBatch processed. Fetching saved translation...");
  const translation = await connection
    .selectFrom("explanations")
    .where("chapter_id", "=", CHAPTER_ID)
    .where("type", "=", "byline" as any)
    .where("language_code", "=", TARGET_LANGUAGE)
    .where("is_active", "=", true)
    .select(["explanation_id", "explanation", "version"])
    .executeTakeFirst();

  if (!translation) {
    console.error(`No active ${TARGET_LANGUAGE} byline saved`);
    db.closeConnection();
    process.exit(1);
  }

  const text = translation.explanation;
  const verseNumberSet = new Set<number>();
  for (const m of text.matchAll(/\b119\s*[:\-]\s*(\d{1,3})\b/g)) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 1 && n <= EXPECTED_VERSES) verseNumberSet.add(n);
  }

  const verseRefs = (text.match(/\{verse:[^}]+\}/g) || []).length;
  const h2Headings = (text.match(/^##\s/gm) || []).length;

  console.log(
    `\n  explanation_id=${translation.explanation_id}, version=${translation.version}`,
  );
  console.log(`  length: ${text.length} chars`);
  console.log(`  ## headings: ${h2Headings}`);
  console.log(`  {verse:} refs: ${verseRefs}`);
  console.log(
    `  unique verse numbers (1-${EXPECTED_VERSES}): ${verseNumberSet.size}`,
  );

  const missing: number[] = [];
  for (let v = 1; v <= EXPECTED_VERSES; v++) {
    if (!verseNumberSet.has(v)) missing.push(v);
  }
  if (missing.length > 0) {
    console.log(
      `  missing: ${missing.length} (${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""})`,
    );
  }

  // Sample first verse
  const sample = text.match(/## [^\n]+119[:\-]1\b[\s\S]{0,300}/);
  if (sample) {
    console.log("\n  --- Sample ---");
    console.log(sample[0].slice(0, 300));
    console.log("  --- end ---");
  }

  const pass =
    verseRefs >= EXPECTED_VERSES * 0.9 &&
    verseNumberSet.size >= EXPECTED_VERSES;

  console.log(`\nStatus: ${pass ? "PASS" : "FAIL"}`);
  db.closeConnection();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  db.closeConnection();
  process.exit(1);
});
