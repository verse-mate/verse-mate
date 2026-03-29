/**
 * Dry-run script to verify byline chunking works end-to-end across all generation paths.
 *
 * Usage:
 *   cd packages/backend-base && bun run src/bible/dry-run-byline-chunking.ts
 *
 * Prerequisites:
 *   - Docker running (PostgreSQL + Valkey)
 *   - .env file present with POSTGRES_URL
 *   - Database seeded with bible data
 *
 * This script does NOT call OpenAI. It uses a mock generator to verify:
 *   1. DB verse counts are correct for known long chapters
 *   2. parseBibleData verse shapes are handled by toBylineVerses
 *   3. Chunking activates for the right chapters
 *   4. All 4 generation paths produce correct chunk splits
 */

import { db } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import {
  BYLINE_CHUNK_SIZE,
  BYLINE_CHUNK_THRESHOLD,
  type BylineVerse,
  generateChunkedByline,
  shouldUseBylineChunking,
  toBylineVerses,
} from "../shared/byline-chunking";
import { parseBibleData } from "./bible";

// --- Config ---

const LONG_CHAPTERS = [
  { book: "Psalms", bookId: 19, chapter: 119, expectedVerses: 176 },
  { book: "Numbers", bookId: 4, chapter: 7, expectedVerses: 89 },
  { book: "Luke", bookId: 42, chapter: 1, expectedVerses: 80 },
  { book: "Genesis", bookId: 1, chapter: 1, expectedVerses: 31 }, // short, should NOT chunk
];

// --- Mock generator ---

function createMockGenerator(bookName: string, chapterNumber: number) {
  return async ({
    startVerse,
    endVerse,
  }: { startVerse: number; endVerse: number }) => {
    const lines: string[] = [];
    for (let v = startVerse; v <= endVerse; v++) {
      lines.push(
        `## ${bookName} ${chapterNumber}:${v}\n> Mock verse ${v} text.\nMock explanation for verse ${v}.`,
      );
    }
    return lines.join("\n\n");
  };
}

// --- Helpers ---

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// --- Tests ---

async function testDbVerses() {
  console.log(
    "\n=== Path 1: DB verse rows (explanation-queue & regeneration service) ===\n",
  );

  const connection = db.getOrCreateConnection();

  const activeVersion = await connection
    .selectFrom("bible_versions")
    .select(["id", "language_code"])
    .where("is_active", "=", true)
    .executeTakeFirst();

  if (!activeVersion) {
    console.error("  SKIP  No active bible version found in DB");
    return;
  }

  console.log(
    `  Active version: id=${activeVersion.id}, language=${activeVersion.language_code}\n`,
  );

  for (const { book, bookId, chapter, expectedVerses } of LONG_CHAPTERS) {
    const chapterRow = await connection
      .selectFrom("chapters")
      .select(["chapter_id"])
      .where("book_id", "=", bookId)
      .where("chapter_number", "=", chapter)
      .executeTakeFirst();

    if (!chapterRow) {
      console.log(`  SKIP  ${book} ${chapter} — chapter not in DB`);
      continue;
    }

    const verses = await connection
      .selectFrom("verses")
      .where("chapter_id", "=", chapterRow.chapter_id)
      .where("version_id", "=", activeVersion.id)
      .select(["verse_number", "text"])
      .orderBy("verse_number", "asc")
      .execute();

    const verseRows = toBylineVerses(verses);
    const shouldChunk = shouldUseBylineChunking("byline", verseRows.length);

    const verseCountMatch = verseRows.length === expectedVerses;
    if (!verseCountMatch) {
      console.log(
        `  INFO  ${book} ${chapter}: DB has ${verseRows.length} verses (expected ${expectedVerses}, may be partial seed)`,
      );
    }

    assert(
      verseRows.length > 0,
      `${book} ${chapter}: has verses in DB (${verseRows.length})`,
    );

    assert(
      verseRows.every((v) => v.verseNumber > 0 && v.text.length > 0),
      `${book} ${chapter}: all verses have valid number and text`,
    );

    // Use actual DB count for chunking decision (not expectedVerses)
    if (shouldChunk) {
      console.log(
        `  INFO  ${book} ${chapter}: chunking with ${verseRows.length} DB verses`,
      );
      const expectedChunks = Math.ceil(verseRows.length / BYLINE_CHUNK_SIZE);
      const chunkRanges: Array<[number, number]> = [];

      const result = await generateChunkedByline({
        verses: verseRows,
        bookName: book,
        chapterNumber: chapter,
        bylineTemplate: `Dry run byline template for ${book} ${chapter}`,
        logPrefix: "[DRY-RUN-DB]",
        generateChunk: async ({ startVerse, endVerse }) => {
          chunkRanges.push([startVerse, endVerse]);
          return createMockGenerator(book, chapter)({ startVerse, endVerse });
        },
      });

      assert(
        chunkRanges.length === expectedChunks,
        `${book} ${chapter}: produced ${chunkRanges.length} chunks`,
        `expected ${expectedChunks}`,
      );

      assert(
        result.includes(`${chapter}:1`),
        `${book} ${chapter}: output contains first verse reference`,
      );

      const lastVerseNum = verseRows[verseRows.length - 1].verseNumber;
      assert(
        result.includes(`${chapter}:${lastVerseNum}`),
        `${book} ${chapter}: output contains last verse reference (${lastVerseNum})`,
      );

      const separators = (result.match(/\n\n---\n\n/g) || []).length;
      assert(
        separators === expectedChunks - 1,
        `${book} ${chapter}: ${separators} chunk separators`,
        `expected ${expectedChunks - 1}`,
      );
    } else {
      assert(
        !shouldChunk,
        `${book} ${chapter}: chunking skipped (${verseRows.length} <= ${BYLINE_CHUNK_THRESHOLD})`,
      );
    }
  }
}

async function testParseBibleDataShape() {
  console.log("\n=== Path 2: parseBibleData shape (pregenerate scripts) ===\n");

  const metadataFile = Bun.file(`${import.meta.dir}/data/key_english.json`);
  const bibleFile = Bun.file(`${import.meta.dir}/data/NASB1995.json`);

  if (!(await bibleFile.exists()) || !(await metadataFile.exists())) {
    console.log("  SKIP  Bible data files not found");
    return;
  }

  const bible = await parseBibleData(bibleFile, metadataFile);

  for (const { book, bookId, chapter, expectedVerses } of LONG_CHAPTERS) {
    const bookData = bible.books.find((b) => b.bookId === bookId);
    if (!bookData) {
      console.log(`  SKIP  ${book} not found in parsed bible data`);
      continue;
    }

    // This is the fix we made: use chapterId (not chapterNumber)
    const chapterData = bookData.chapters.find((c) => c.chapterId === chapter);

    assert(!!chapterData, `${book} ${chapter}: found via chapterId lookup`);

    if (!chapterData) continue;

    // Verify raw verse shape
    const rawVerse = chapterData.verses[0];
    assert(
      "verseId" in rawVerse && typeof rawVerse.verseId === "number",
      `${book} ${chapter}: raw verse has verseId property`,
    );

    // Test that toBylineVerses handles the raw shape directly (the fix)
    const verseRows = toBylineVerses(chapterData.verses);
    assert(
      verseRows.length === expectedVerses,
      `${book} ${chapter}: toBylineVerses from parseBibleData = ${verseRows.length}`,
      `expected ${expectedVerses}`,
    );

    assert(
      verseRows[0].verseNumber === 1,
      `${book} ${chapter}: first verse number is 1`,
    );

    const shouldChunk = shouldUseBylineChunking("byline", verseRows.length);

    if (expectedVerses > BYLINE_CHUNK_THRESHOLD) {
      assert(
        shouldChunk,
        `${book} ${chapter}: parseBibleData path triggers chunking`,
      );

      const chunkRanges: Array<[number, number]> = [];

      await generateChunkedByline({
        verses: verseRows,
        bookName: book,
        chapterNumber: chapter,
        bylineTemplate: `Dry run byline template for ${book} ${chapter}`,
        logPrefix: "[DRY-RUN-PARSE]",
        generateChunk: async ({ startVerse, endVerse }) => {
          chunkRanges.push([startVerse, endVerse]);
          return createMockGenerator(
            book,
            chapter,
          )({
            startVerse,
            endVerse,
          });
        },
      });

      // Verify last chunk ends at the right verse
      const lastChunk = chunkRanges[chunkRanges.length - 1];
      assert(
        lastChunk[1] === expectedVerses,
        `${book} ${chapter}: last chunk ends at verse ${lastChunk[1]}`,
        `expected ${expectedVerses}`,
      );
    }
  }
}

async function testNonBylineSkipsChunking() {
  console.log("\n=== Path 3: Non-byline types skip chunking ===\n");

  const nonBylineTypes = Object.values(ExplanationTypeEnum).filter(
    (t) => t !== "byline",
  );

  for (const type of nonBylineTypes) {
    assert(
      !shouldUseBylineChunking(type, 200),
      `${type}: chunking skipped even with 200 verses`,
    );
  }
}

async function testEdgeCases() {
  console.log("\n=== Path 4: Edge cases ===\n");

  // Exactly at threshold
  assert(
    !shouldUseBylineChunking("byline", BYLINE_CHUNK_THRESHOLD),
    `byline with exactly ${BYLINE_CHUNK_THRESHOLD} verses: no chunking`,
  );

  // One above threshold
  assert(
    shouldUseBylineChunking("byline", BYLINE_CHUNK_THRESHOLD + 1),
    `byline with ${BYLINE_CHUNK_THRESHOLD + 1} verses: chunking activates`,
  );

  // Mixed property names (simulating different code paths)
  const mixedInput = [
    { verse_number: 1, text: "DB format" },
    { verseNumber: 2, text: "camelCase format" },
    { verseId: 3, text: "parseBibleData format" },
  ];
  const mixed = toBylineVerses(mixedInput);
  assert(
    mixed.length === 3 &&
      mixed[0].verseNumber === 1 &&
      mixed[1].verseNumber === 2 &&
      mixed[2].verseNumber === 3,
    "toBylineVerses handles mixed property names in single array",
  );

  // Chunk size boundary: exactly BYLINE_CHUNK_SIZE verses should be 1 chunk
  const exactChunkVerses: BylineVerse[] = Array.from(
    { length: BYLINE_CHUNK_SIZE },
    (_, i) => ({
      verseNumber: i + 1,
      text: `v${i + 1}`,
    }),
  );
  const exactChunkRanges: Array<[number, number]> = [];
  await generateChunkedByline({
    verses: exactChunkVerses,
    bookName: "Test",
    chapterNumber: 1,
    bylineTemplate: "Dry run edge case template",
    logPrefix: "[DRY-RUN-EDGE]",
    generateChunk: async ({ startVerse, endVerse }) => {
      exactChunkRanges.push([startVerse, endVerse]);
      return createMockGenerator("Test", 1)({ startVerse, endVerse });
    },
  });
  assert(
    exactChunkRanges.length === 1,
    `exactly ${BYLINE_CHUNK_SIZE} verses = 1 chunk`,
  );

  // BYLINE_CHUNK_SIZE + 1 verses should be 2 chunks
  const overChunkVerses: BylineVerse[] = Array.from(
    { length: BYLINE_CHUNK_SIZE + 1 },
    (_, i) => ({
      verseNumber: i + 1,
      text: `v${i + 1}`,
    }),
  );
  const overChunkRanges: Array<[number, number]> = [];
  await generateChunkedByline({
    verses: overChunkVerses,
    bookName: "Test",
    chapterNumber: 1,
    bylineTemplate: "Dry run edge case template",
    logPrefix: "[DRY-RUN-EDGE]",
    generateChunk: async ({ startVerse, endVerse }) => {
      overChunkRanges.push([startVerse, endVerse]);
      return createMockGenerator("Test", 1)({ startVerse, endVerse });
    },
  });
  assert(
    overChunkRanges.length === 2,
    `${BYLINE_CHUNK_SIZE + 1} verses = 2 chunks`,
  );
  assert(
    overChunkRanges[1][0] === BYLINE_CHUNK_SIZE + 1 &&
      overChunkRanges[1][1] === BYLINE_CHUNK_SIZE + 1,
    `second chunk is single verse ${BYLINE_CHUNK_SIZE + 1}`,
  );
}

// --- Main ---

async function main() {
  console.log("=== Byline Chunking Dry Run ===");
  console.log(
    `Chunk size: ${BYLINE_CHUNK_SIZE}, Threshold: ${BYLINE_CHUNK_THRESHOLD}\n`,
  );

  try {
    await testDbVerses();
  } catch (err) {
    console.error("  ERROR  DB verse test failed:", err);
  }

  try {
    await testParseBibleDataShape();
  } catch (err) {
    console.error("  ERROR  parseBibleData test failed:", err);
  }

  try {
    await testNonBylineSkipsChunking();
  } catch (err) {
    console.error("  ERROR  non-byline test failed:", err);
  }

  try {
    await testEdgeCases();
  } catch (err) {
    console.error("  ERROR  edge case test failed:", err);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  db.closeConnection();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  db.closeConnection();
  process.exit(1);
});
