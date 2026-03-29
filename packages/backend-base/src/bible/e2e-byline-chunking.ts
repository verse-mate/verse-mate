/**
 * E2E test: Real OpenAI API call for Psalms 119 byline chunked generation.
 *
 * Usage:
 *   cd packages/backend-base && bun run src/bible/e2e-byline-chunking.ts
 *
 * Prerequisites:
 *   - Docker running (PostgreSQL)
 *   - .env with POSTGRES_URL and OPEN_AI_KEY
 *
 * What it does:
 *   1. Reads Psalms 119 verses from DB (chapter_id=1060, mapped under 2 Timothy locally)
 *   2. Loads the real byline template from user_prompt_templates
 *   3. Builds chunked prompts using the real template (same as batch-operations)
 *   4. Calls OpenAI in PARALLEL for all chunks
 *   5. Stitches chunks together
 *   6. Saves to DB as a new explanation version
 *   7. Reads it back and verifies verse coverage
 */

import { db } from "database";
import OpenAI from "openai";
import {
  buildBylineChunkPrompts,
  shouldUseBylineChunking,
  stitchBylineChunks,
  toBylineVerses,
} from "../shared/byline-chunking";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

// Psalms 119 is under chapter_id=1060 in the local DB (mapped to book 55 / 2 Timothy due to seed bug)
const PSALMS_119_CHAPTER_ID = 1060;
const EXPECTED_VERSES = 176;
const MODEL = "gpt-5-mini";
const LANGUAGE_CODE = "en";

async function main() {
  const connection = db.getOrCreateConnection();

  console.log("=== E2E Byline Chunking Test: Psalms 119 ===\n");

  // Step 1: Read verses
  console.log("Step 1: Reading verses from DB...");
  const activeVersion = await connection
    .selectFrom("bible_versions")
    .select(["id", "language_code"])
    .where("is_active", "=", true)
    .executeTakeFirst();

  if (!activeVersion) {
    throw new Error("No active bible version");
  }

  const verses = await connection
    .selectFrom("verses")
    .where("chapter_id", "=", PSALMS_119_CHAPTER_ID)
    .where("version_id", "=", activeVersion.id)
    .select(["verse_number", "text"])
    .orderBy("verse_number", "asc")
    .execute();

  const verseRows = toBylineVerses(verses);
  console.log(`  Found ${verseRows.length} verses`);

  if (verseRows.length !== EXPECTED_VERSES) {
    throw new Error(
      `Expected ${EXPECTED_VERSES} verses, got ${verseRows.length}`,
    );
  }

  if (!shouldUseBylineChunking("byline", verseRows.length)) {
    throw new Error("shouldUseBylineChunking returned false — logic error");
  }

  // Step 2: Load prompts from DB (same as batch-operations and playground)
  console.log("\nStep 2: Loading prompts from DB...");
  const systemPrompt = await connection
    .selectFrom("prompts")
    .where("status", "=", "active" as any)
    .where("prompt_type", "=", "system" as any)
    .select("prompt")
    .executeTakeFirst();

  if (!systemPrompt) {
    throw new Error("No active system prompt found");
  }
  console.log(`  System prompt loaded (${systemPrompt.prompt.length} chars)`);

  const bylineTemplate = await connection
    .selectFrom("user_prompt_templates")
    .where("explanation_type", "=", "byline")
    .where("status", "=", "active")
    .select("prompt_template")
    .executeTakeFirst();

  if (!bylineTemplate) {
    throw new Error("No active byline template found");
  }

  // Replace placeholders (same as getExplanationTypePrompt does, minus {verseRange}/{verseRangeContext} which chunking handles)
  const resolvedTemplate = bylineTemplate.prompt_template
    .replace("{bookName}", "Psalms")
    .replace("{chapterNumber}", "119")
    .replace("{language}", "English");

  console.log(
    `  Byline template loaded and resolved (${resolvedTemplate.length} chars)`,
  );

  // Step 3: Build chunk prompts using the real template
  console.log("\nStep 3: Building chunk prompts...");
  const chunkPrompts = buildBylineChunkPrompts({
    verses: verseRows,
    bookName: "Psalms",
    chapterNumber: 119,
    bylineTemplate: resolvedTemplate,
  });

  console.log(`  Generated ${chunkPrompts.length} chunk prompts:`);
  for (const chunk of chunkPrompts) {
    console.log(
      `    Chunk ${chunk.chunkIndex}: verses ${chunk.startVerse}-${chunk.endVerse}`,
    );
  }

  // Step 4: Call OpenAI in PARALLEL for all chunks
  console.log("\nStep 4: Calling OpenAI in parallel for all chunks...");
  const startTime = Date.now();

  const chunkResults = await Promise.all(
    chunkPrompts.map(async (chunk) => {
      const label = `  Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} (verses ${chunk.startVerse}-${chunk.endVerse})`;
      console.log(`${label}: calling API...`);

      const chunkStart = Date.now();
      const response = await openai.responses.create({
        model: MODEL,
        reasoning: { effort: "medium" as any },
        instructions: systemPrompt.prompt,
        input: chunk.prompt,
        max_output_tokens: 16000,
      });

      const text = response.output_text || "";
      const elapsed = ((Date.now() - chunkStart) / 1000).toFixed(1);
      const usage = response.usage;
      const inputTok = usage?.input_tokens || 0;
      const outputTok = usage?.output_tokens || 0;

      console.log(
        `${label}: done — ${text.length} chars, ${inputTok}+${outputTok} tokens, ${elapsed}s`,
      );

      if (!text.trim()) {
        throw new Error(
          `Empty response for chunk ${chunk.chunkIndex} (verses ${chunk.startVerse}-${chunk.endVerse})`,
        );
      }

      return {
        chunkIndex: chunk.chunkIndex,
        text,
        inputTokens: inputTok,
        outputTokens: outputTok,
      };
    }),
  );

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalInputTokens = chunkResults.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutputTokens = chunkResults.reduce(
    (s, r) => s + r.outputTokens,
    0,
  );

  console.log(`\n  All chunks done in ${totalElapsed}s (parallel)`);
  console.log(
    `  Total tokens: ${totalInputTokens} input + ${totalOutputTokens} output = ${totalInputTokens + totalOutputTokens}`,
  );

  // Step 5: Stitch chunks
  console.log("\nStep 5: Stitching chunks...");
  const stitchedExplanation = stitchBylineChunks(chunkResults);
  console.log(`  Stitched length: ${stitchedExplanation.length} chars`);

  // Step 6: Verify verse coverage in stitched output
  console.log("\nStep 6: Verifying verse coverage...");
  const verseMentionPattern = /\b119\s*[:\-]\s*(\d{1,3})\b/g;
  const mentionedVerses = new Set<number>();
  for (const m of stitchedExplanation.matchAll(verseMentionPattern)) {
    mentionedVerses.add(Number.parseInt(m[1], 10));
  }

  const missingVerses: number[] = [];
  for (let v = 1; v <= EXPECTED_VERSES; v++) {
    if (!mentionedVerses.has(v)) {
      missingVerses.push(v);
    }
  }

  console.log(`  Verses mentioned: ${mentionedVerses.size}/${EXPECTED_VERSES}`);
  if (missingVerses.length > 0) {
    console.warn(`  Missing verses: ${missingVerses.join(", ")}`);
  } else {
    console.log("  All 176 verses covered!");
  }

  // Step 7: Check format matches prod (## Book Ch:V, > {verse:...}, ### Summary)
  console.log("\nStep 7: Checking output format...");
  const headingPattern = /^## Psalms 119:\d+/gm;
  const verseRefPattern = />\s*\{verse:Psalms 119:\d+\}/g;
  const summaryPattern = /^### Summary/gm;

  const headings = stitchedExplanation.match(headingPattern) || [];
  const verseRefs = stitchedExplanation.match(verseRefPattern) || [];
  const summaries = stitchedExplanation.match(summaryPattern) || [];

  console.log(
    `  ## headings: ${headings.length} (expected ${EXPECTED_VERSES})`,
  );
  console.log(
    `  > {verse:...} refs: ${verseRefs.length} (expected ${EXPECTED_VERSES})`,
  );
  console.log(
    `  ### Summary sections: ${summaries.length} (expected ${EXPECTED_VERSES})`,
  );

  // Show first verse as sample
  const firstVerseMatch = stitchedExplanation.match(
    /## Psalms 119:1[\s\S]*?(?=## Psalms 119:2|$)/,
  );
  if (firstVerseMatch) {
    console.log("\n  --- Sample: first verse ---");
    console.log(firstVerseMatch[0].slice(0, 500));
    console.log("  --- end sample ---");
  }

  // Step 8: Save to DB
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
        explanation: stitchedExplanation,
        chapter_id: PSALMS_119_CHAPTER_ID,
        language_code: LANGUAGE_CODE,
        version: nextVersion,
        is_active: true,
        created_at: new Date(),
      })
      .execute();
  });

  console.log(`  Saved as version ${nextVersion}`);

  // Step 9: Read back and verify
  console.log("\nStep 9: Reading back from DB...");
  const savedExplanation = await connection
    .selectFrom("explanations")
    .where("chapter_id", "=", PSALMS_119_CHAPTER_ID)
    .where("type", "=", "byline" as any)
    .where("language_code", "=", LANGUAGE_CODE)
    .where("is_active", "=", true)
    .select(["explanation_id", "explanation", "version"])
    .executeTakeFirst();

  if (!savedExplanation) {
    throw new Error("Failed to read back saved explanation");
  }

  console.log(
    `  Read back: explanation_id=${savedExplanation.explanation_id}, version=${savedExplanation.version}, length=${savedExplanation.explanation.length}`,
  );

  const lengthMatch =
    savedExplanation.explanation.length === stitchedExplanation.length;
  console.log(`  Length matches stitched: ${lengthMatch}`);

  // Summary
  const formatOk =
    headings.length >= EXPECTED_VERSES * 0.9 &&
    verseRefs.length >= EXPECTED_VERSES * 0.9 &&
    summaries.length >= EXPECTED_VERSES * 0.9;

  console.log("\n=== Results ===");
  console.log(`  Verses: ${verseRows.length}/${EXPECTED_VERSES}`);
  console.log(
    `  Chunks: ${chunkPrompts.length} (parallel in ${totalElapsed}s)`,
  );
  console.log(
    `  Tokens: ${totalInputTokens} in + ${totalOutputTokens} out = ${totalInputTokens + totalOutputTokens}`,
  );
  console.log(`  Verse coverage: ${mentionedVerses.size}/${EXPECTED_VERSES}`);
  console.log(
    `  Missing: ${missingVerses.length === 0 ? "none" : missingVerses.join(", ")}`,
  );
  console.log(
    `  Format: ${headings.length} headings, ${verseRefs.length} {verse:} refs, ${summaries.length} summaries`,
  );
  console.log(`  DB version: ${savedExplanation.version}`);
  console.log(
    `  Status: ${missingVerses.length === 0 && lengthMatch && formatOk ? "PASS" : "FAIL"}`,
  );

  db.closeConnection();
  process.exit(missingVerses.length === 0 && lengthMatch && formatOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  db.closeConnection();
  process.exit(1);
});
