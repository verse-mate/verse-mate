/**
 * E2E: Submit a REAL OpenAI Batch API job for Psalms 119 byline chunking.
 *
 * Usage:
 *   cd packages/backend-base && bun run src/bible/e2e-batch-byline-chunking.ts
 *
 * This submits the batch, polls until complete, then parses the output
 * using the exact same logic as batch-operations.service.ts.
 */

import { db } from "database";
import OpenAI from "openai";
import {
  buildBylineChunkPrompts,
  stitchBylineChunks,
  toBylineVerses,
} from "../shared/byline-chunking";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

const PSALMS_119_CHAPTER_ID = 1060;
const MODEL = "gpt-5-mini";
const LANGUAGE_CODE = "en";
const MAX_OUTPUT_TOKENS = 16000;
const EFFORT = "medium";

const CHUNK_PATTERN =
  /^(.+)-(\d+)-byline-(\d+)-chunk-(\d+)-of-(\d+)-v(\d+)-(\d+)$/;

async function main() {
  const connection = db.getOrCreateConnection();
  console.log("=== E2E Batch Byline Chunking: Psalms 119 ===\n");

  // --- Step 1: Load data ---
  console.log("Step 1: Loading data from DB...");

  const activeVersion = await connection
    .selectFrom("bible_versions")
    .select(["id", "language_code"])
    .where("is_active", "=", true)
    .executeTakeFirst();
  if (!activeVersion) throw new Error("No active bible version");

  const verses = await connection
    .selectFrom("verses")
    .where("chapter_id", "=", PSALMS_119_CHAPTER_ID)
    .where("version_id", "=", activeVersion.id)
    .select(["verse_number", "text"])
    .orderBy("verse_number", "asc")
    .execute();
  const verseRows = toBylineVerses(verses);
  console.log(`  ${verseRows.length} verses`);

  const systemPrompt = await connection
    .selectFrom("prompts")
    .where("status", "=", "active" as any)
    .where("prompt_type", "=", "system" as any)
    .select("prompt")
    .executeTakeFirst();
  if (!systemPrompt) throw new Error("No active system prompt");

  const bylineTemplate = await connection
    .selectFrom("user_prompt_templates")
    .where("explanation_type", "=", "byline")
    .where("status", "=", "active")
    .select("prompt_template")
    .executeTakeFirst();
  if (!bylineTemplate) throw new Error("No active byline template");

  const resolvedTemplate = bylineTemplate.prompt_template
    .replace("{bookName}", "Psalms")
    .replace("{chapterNumber}", "119")
    .replace("{language}", "English");

  // --- Step 2: Build JSONL (exact same as batch-operations.service.ts) ---
  console.log("\nStep 2: Building JSONL...");

  const chunkPrompts = buildBylineChunkPrompts({
    verses: verseRows,
    bookName: "Psalms",
    chapterNumber: 119,
    bylineTemplate: resolvedTemplate,
  });

  const sanitizedSystemPrompt = systemPrompt.prompt
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const bookSlug = "psalms";
  const batchRequests = chunkPrompts.map((chunk) => ({
    custom_id: `${bookSlug}-119-byline-${PSALMS_119_CHAPTER_ID}-chunk-${chunk.chunkIndex}-of-${chunk.totalChunks}-v${chunk.startVerse}-${chunk.endVerse}`,
    method: "POST" as const,
    url: "/v1/responses" as const,
    body: {
      model: MODEL,
      reasoning: { effort: EFFORT },
      instructions: sanitizedSystemPrompt,
      input: chunk.prompt.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
      max_output_tokens: MAX_OUTPUT_TOKENS,
    },
  }));

  const jsonlContent = batchRequests.map((r) => JSON.stringify(r)).join("\n");

  console.log(`  ${batchRequests.length} JSONL lines`);
  for (const r of batchRequests) {
    console.log(`    ${r.custom_id}`);
  }

  // --- Step 3: Upload JSONL file ---
  console.log("\nStep 3: Uploading JSONL to OpenAI...");

  const blob = new Blob([jsonlContent], { type: "application/jsonl" });
  const file = new File([blob], "psalms-119-byline-chunks.jsonl", {
    type: "application/jsonl",
  });

  const uploadedFile = await openai.files.create({
    file,
    purpose: "batch",
  });
  console.log(`  File uploaded: ${uploadedFile.id}`);

  // --- Step 4: Create batch ---
  console.log("\nStep 4: Submitting batch...");

  const batch = await openai.batches.create({
    input_file_id: uploadedFile.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
  });
  console.log(`  Batch created: ${batch.id}`);
  console.log(`  Status: ${batch.status}`);

  // --- Step 5: Poll for completion ---
  console.log("\nStep 5: Polling for completion...");
  const startTime = Date.now();

  let currentBatch = batch;
  while (
    currentBatch.status !== "completed" &&
    currentBatch.status !== "failed" &&
    currentBatch.status !== "expired" &&
    currentBatch.status !== "cancelled"
  ) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(
      `\r  Status: ${currentBatch.status} (${elapsed}s)    `,
    );
    await new Promise((r) => setTimeout(r, 10000));
    currentBatch = await openai.batches.retrieve(batch.id);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n  Final status: ${currentBatch.status} (${totalTime}s)`);

  if (currentBatch.status !== "completed") {
    console.error("  Batch did not complete successfully");
    console.error("  Errors:", currentBatch.errors);
    db.closeConnection();
    process.exit(1);
  }

  console.log(
    `  Counts: ${currentBatch.request_counts?.completed} completed, ${currentBatch.request_counts?.failed} failed`,
  );

  // --- Step 6: Download and parse output ---
  console.log("\nStep 6: Downloading and parsing output...");

  const outputFileId = currentBatch.output_file_id;
  if (!outputFileId) throw new Error("No output file ID");

  const fileContent = await openai.files.content(outputFileId);
  const jsonl = await fileContent.text();
  const lines = jsonl.split("\n").filter((l) => l.trim());

  console.log(`  ${lines.length} output lines`);

  // Parse using exact same logic as processOutputFile
  const bylineChunkCollector = new Map<
    string,
    {
      chapterNumber: number;
      chapterId: number;
      totalChunks: number;
      chunks: Array<{ chunkIndex: number; text: string }>;
    }
  >();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let errors = 0;

  for (const line of lines) {
    const parsedLine = JSON.parse(line);

    if (parsedLine.response?.body?.usage) {
      totalInputTokens += parsedLine.response.body.usage.input_tokens || 0;
      totalOutputTokens += parsedLine.response.body.usage.output_tokens || 0;
    }

    const responseBody = parsedLine.response?.body;
    let extractedText: string | undefined = responseBody?.output_text;

    if (!extractedText && Array.isArray(responseBody?.output)) {
      for (const item of responseBody.output) {
        const textCandidate = item?.content?.find?.(
          (c: any) => typeof c?.text === "string",
        )?.text;
        if (textCandidate) {
          extractedText = textCandidate;
          break;
        }
      }
    }

    if (
      parsedLine.custom_id &&
      parsedLine.response?.status_code === 200 &&
      typeof extractedText === "string" &&
      extractedText.length > 0
    ) {
      const chunkMatch = parsedLine.custom_id.match(CHUNK_PATTERN);
      if (chunkMatch) {
        const chapterNumber = Number.parseInt(chunkMatch[2], 10);
        const chapterId = Number.parseInt(chunkMatch[3], 10);
        const chunkIndex = Number.parseInt(chunkMatch[4], 10);
        const totalChunks = Number.parseInt(chunkMatch[5], 10);

        const key = `${chapterId}`;
        if (!bylineChunkCollector.has(key)) {
          bylineChunkCollector.set(key, {
            chapterNumber,
            chapterId,
            totalChunks,
            chunks: [],
          });
        }
        bylineChunkCollector
          .get(key)
          ?.chunks.push({ chunkIndex, text: extractedText });

        console.log(
          `  Chunk ${chunkIndex + 1}/${totalChunks}: ${extractedText.length} chars`,
        );
      }
    } else {
      console.error(
        `  Failed line: ${parsedLine.custom_id} status=${parsedLine.response?.status_code}`,
      );
      errors++;
    }
  }

  // --- Step 7: Stitch and verify ---
  console.log("\nStep 7: Stitching and verifying...");

  const collected = bylineChunkCollector.get(`${PSALMS_119_CHAPTER_ID}`);
  if (!collected) {
    throw new Error("No chunks collected for Psalms 119");
  }

  if (collected.chunks.length < collected.totalChunks) {
    throw new Error(
      `Incomplete: ${collected.chunks.length}/${collected.totalChunks} chunks`,
    );
  }

  const stitchedText = stitchBylineChunks(collected.chunks);
  console.log(`  Stitched: ${stitchedText.length} chars`);

  // Verify format
  const headings = stitchedText.match(/^## Psalms 119:\d+/gm) || [];
  const verseRefs = stitchedText.match(/>\s*\{verse:Psalms 119:\d+\}/g) || [];
  const summaries = stitchedText.match(/^### Summary/gm) || [];

  console.log(`  ## headings: ${headings.length}`);
  console.log(`  > {verse:...} refs: ${verseRefs.length}`);
  console.log(`  ### Summary sections: ${summaries.length}`);

  // Verify verse coverage
  const verseMentionPattern = /\b119\s*[:\-]\s*(\d{1,3})\b/g;
  const mentionedVerses = new Set<number>();
  for (const m of stitchedText.matchAll(verseMentionPattern)) {
    mentionedVerses.add(Number.parseInt(m[1], 10));
  }
  const missing: number[] = [];
  for (let v = 1; v <= 176; v++) {
    if (!mentionedVerses.has(v)) missing.push(v);
  }

  // Show sample
  const firstVerse = stitchedText.match(
    /## Psalms 119:1[\s\S]*?(?=## Psalms 119:2|$)/,
  );
  if (firstVerse) {
    console.log("\n  --- Sample ---");
    console.log(firstVerse[0].slice(0, 400));
    console.log("  --- end ---");
  }

  // --- Step 8: Save to DB ---
  console.log("\nStep 8: Saving to DB...");

  const existingExplanation = await connection
    .selectFrom("explanations")
    .where("chapter_id", "=", PSALMS_119_CHAPTER_ID)
    .where("type", "=", "byline" as any)
    .where("language_code", "=", LANGUAGE_CODE)
    .orderBy("version", "desc")
    .select("version")
    .executeTakeFirst();

  const nextVersion = existingExplanation ? existingExplanation.version + 1 : 1;

  await connection.transaction().execute(async (trx) => {
    await trx
      .updateTable("explanations")
      .set({ is_active: false })
      .where("chapter_id", "=", PSALMS_119_CHAPTER_ID)
      .where("type", "=", "byline" as any)
      .where("language_code", "=", LANGUAGE_CODE)
      .execute();

    await trx
      .insertInto("explanations")
      .values({
        type: "byline" as any,
        explanation: stitchedText,
        chapter_id: PSALMS_119_CHAPTER_ID,
        language_code: LANGUAGE_CODE,
        version: nextVersion,
        is_active: true,
        created_at: new Date(),
      })
      .execute();
  });

  console.log(`  Saved as version ${nextVersion}`);

  // --- Summary ---
  const formatOk =
    verseRefs.length >= 176 * 0.9 && summaries.length >= 176 * 0.9;
  const allPass = missing.length === 0 && errors === 0 && formatOk;

  console.log("\n=== Results ===");
  console.log(`  Batch ID: ${batch.id}`);
  console.log(`  Batch time: ${totalTime}s`);
  console.log(
    `  Tokens: ${totalInputTokens} in + ${totalOutputTokens} out = ${totalInputTokens + totalOutputTokens}`,
  );
  console.log(`  Verse coverage: ${mentionedVerses.size}/176`);
  console.log(
    `  Missing: ${missing.length === 0 ? "none" : missing.join(", ")}`,
  );
  console.log(
    `  Format: ${headings.length} headings, ${verseRefs.length} refs, ${summaries.length} summaries`,
  );
  console.log(`  API errors: ${errors}`);
  console.log(`  DB version: ${nextVersion}`);
  console.log(`  Status: ${allPass ? "PASS" : "FAIL"}`);

  db.closeConnection();
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  db.closeConnection();
  process.exit(1);
});
