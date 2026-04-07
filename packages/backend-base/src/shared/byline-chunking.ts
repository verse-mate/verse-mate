export const BYLINE_CHUNK_SIZE = 40;
export const BYLINE_CHUNK_THRESHOLD = 50;

export type BylineVerse = {
  verseNumber: number;
  text: string;
};

type GenerateBylineChunkParams = {
  prompt: string;
  startVerse: number;
  endVerse: number;
  isFirst: boolean;
  attempt: number;
};

type GenerateChunkedBylineParams = {
  verses: BylineVerse[];
  bookName: string;
  chapterNumber: number;
  /** The resolved byline user prompt template (with {bookName}/{chapterNumber}/{language} already replaced) */
  bylineTemplate: string;
  chunkSize?: number;
  maxRetries?: number;
  logPrefix?: string;
  generateChunk: (params: GenerateBylineChunkParams) => Promise<string>;
};

type ChunkCoverage = {
  valid: boolean;
  reason: string;
  mentionsInRange: number[];
};

const REFUSAL_PATTERN =
  /\b(?:can(?:not|'t)|unable|won't|exceed(?:s|ed|ing)?)\b[\s\S]{0,120}\b(?:limit|single response|single message|token|length|size)\b/i;

export function toBylineVerses(
  verses: Array<{
    verse_number?: number;
    verseNumber?: number;
    verseId?: number;
    text: string;
  }>,
): BylineVerse[] {
  return verses
    .map((v) => ({
      verseNumber: v.verse_number ?? v.verseNumber ?? v.verseId ?? 0,
      text: v.text,
    }))
    .filter((v) => Number.isFinite(v.verseNumber) && v.verseNumber > 0)
    .sort((a, b) => a.verseNumber - b.verseNumber);
}

function buildRangePrompt({
  bookName,
  chapterNumber,
  startVerse,
  endVerse,
  versesText,
  isFirst,
  isRetry,
  bylineTemplate,
}: {
  bookName: string;
  chapterNumber: number;
  startVerse: number;
  endVerse: number;
  versesText: string;
  isFirst: boolean;
  isRetry: boolean;
  bylineTemplate: string;
}) {
  let prompt = bylineTemplate
    .replaceAll("{verseRange}", `verses ${startVerse} through ${endVerse}`)
    .replaceAll(
      "{verseRangeContext}",
      `Biblical Text (${bookName} ${chapterNumber} verses ${startVerse}-${endVerse}):\n${versesText}`,
    );

  if (!isFirst) {
    prompt +=
      "\n\n- Do NOT include the title heading — this is a continuation of a chunked generation.";
  }
  if (isRetry) {
    prompt += `\n\n- Previous attempt did not fully cover the required range. Ensure you include every verse from ${startVerse} to ${endVerse}.`;
  }

  return prompt;
}

function collectVerseMentionsForChapter(
  output: string,
  chapterNumber: number,
): number[] {
  const chapterPattern = new RegExp(
    `\\b${chapterNumber}\\s*[:\\-]\\s*(\\d{1,3})\\b`,
    "g",
  );
  const simpleHeadingPattern = /^##\s*(\d{1,3})\b/gm;

  const chapterMentions = [...output.matchAll(chapterPattern)]
    .map((m) => Number.parseInt(m[1], 10))
    .filter((n) => Number.isFinite(n));

  const simpleMentions = [...output.matchAll(simpleHeadingPattern)]
    .map((m) => Number.parseInt(m[1], 10))
    .filter((n) => Number.isFinite(n));

  return [...chapterMentions, ...simpleMentions];
}

function validateChunkCoverage({
  output,
  chapterNumber,
  startVerse,
  endVerse,
}: {
  output: string;
  chapterNumber: number;
  startVerse: number;
  endVerse: number;
}): ChunkCoverage {
  if (!output.trim()) {
    return { valid: false, reason: "empty-output", mentionsInRange: [] };
  }

  if (REFUSAL_PATTERN.test(output)) {
    return { valid: false, reason: "model-refusal", mentionsInRange: [] };
  }

  const mentions = collectVerseMentionsForChapter(output, chapterNumber);
  const mentionsInRange = mentions
    .filter((n) => n >= startVerse && n <= endVerse)
    .sort((a, b) => a - b);

  const hasStart = mentionsInRange.includes(startVerse);
  const hasEnd = mentionsInRange.includes(endVerse);

  if (!hasStart || !hasEnd) {
    return {
      valid: false,
      reason:
        !hasStart && !hasEnd
          ? "missing-range-boundaries"
          : !hasStart
            ? "missing-start-verse"
            : "missing-end-verse",
      mentionsInRange,
    };
  }

  return { valid: true, reason: "ok", mentionsInRange };
}

export async function generateChunkedByline({
  verses,
  bookName,
  chapterNumber,
  bylineTemplate,
  chunkSize = BYLINE_CHUNK_SIZE,
  maxRetries = 1,
  logPrefix = "[BYLINE_CHUNK]",
  generateChunk,
}: GenerateChunkedBylineParams): Promise<string> {
  const sortedVerses = [...verses].sort(
    (a, b) => a.verseNumber - b.verseNumber,
  );

  if (sortedVerses.length === 0) {
    throw new Error("Cannot chunk byline generation without verses");
  }

  const maxVerseNumber = sortedVerses[sortedVerses.length - 1].verseNumber;
  const chunks: string[] = [];

  for (
    let startVerse = sortedVerses[0].verseNumber;
    startVerse <= maxVerseNumber;
    startVerse += chunkSize
  ) {
    const endVerse = Math.min(startVerse + chunkSize - 1, maxVerseNumber);
    const isFirst = startVerse === sortedVerses[0].verseNumber;

    const versesText = sortedVerses
      .filter((v) => v.verseNumber >= startVerse && v.verseNumber <= endVerse)
      .map((v) => `${v.verseNumber}. ${v.text}`)
      .join("\n");

    if (!versesText.trim()) {
      throw new Error(
        `No verse text found for range ${startVerse}-${endVerse}`,
      );
    }

    let finalChunkText = "";
    let lastReason = "unknown";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const prompt = buildRangePrompt({
        bookName,
        chapterNumber,
        startVerse,
        endVerse,
        versesText,
        isFirst,
        isRetry: attempt > 0,
        bylineTemplate,
      });

      const attemptLabel = `${logPrefix} verses ${startVerse}-${endVerse} attempt ${attempt + 1}/${maxRetries + 1}`;
      console.log(`${attemptLabel} generating`);

      const chunkText = await generateChunk({
        prompt,
        startVerse,
        endVerse,
        isFirst,
        attempt,
      });

      const coverage = validateChunkCoverage({
        output: chunkText,
        chapterNumber,
        startVerse,
        endVerse,
      });

      if (coverage.valid) {
        console.log(`${attemptLabel} valid`);
        finalChunkText = chunkText;
        break;
      }

      lastReason = coverage.reason;
      console.warn(
        `${attemptLabel} invalid (${coverage.reason}), mentions in range: [${coverage.mentionsInRange.join(", ")}]`,
      );
    }

    if (!finalChunkText) {
      throw new Error(
        `Failed to generate valid chunk for verses ${startVerse}-${endVerse}: ${lastReason}`,
      );
    }

    chunks.push(finalChunkText);
  }

  return chunks.join("\n\n");
}

/**
 * Like generateChunkedByline but fires all chunks in parallel.
 * Use for playground/sync calls where latency matters.
 */
export async function generateChunkedBylineParallel({
  verses,
  bookName,
  chapterNumber,
  bylineTemplate,
  chunkSize = BYLINE_CHUNK_SIZE,
  maxRetries = 1,
  logPrefix = "[BYLINE_CHUNK_PARALLEL]",
  generateChunk,
}: GenerateChunkedBylineParams): Promise<string> {
  const chunkPrompts = buildBylineChunkPrompts({
    verses,
    bookName,
    chapterNumber,
    bylineTemplate,
    chunkSize,
  });

  if (chunkPrompts.length === 0) {
    throw new Error("Cannot chunk byline generation without verses");
  }

  const results = await Promise.all(
    chunkPrompts.map(async (chunk) => {
      let finalText = "";
      let lastReason = "unknown";

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const attemptLabel = `${logPrefix} verses ${chunk.startVerse}-${chunk.endVerse} attempt ${attempt + 1}/${maxRetries + 1}`;
        console.log(`${attemptLabel} generating`);

        const text = await generateChunk({
          prompt: chunk.prompt,
          startVerse: chunk.startVerse,
          endVerse: chunk.endVerse,
          isFirst: chunk.chunkIndex === 0,
          attempt,
        });

        const coverage = validateChunkCoverage({
          output: text,
          chapterNumber,
          startVerse: chunk.startVerse,
          endVerse: chunk.endVerse,
        });

        if (coverage.valid) {
          console.log(`${attemptLabel} valid`);
          finalText = text;
          break;
        }

        lastReason = coverage.reason;
        console.warn(
          `${attemptLabel} invalid (${coverage.reason}), mentions: [${coverage.mentionsInRange.join(", ")}]`,
        );
      }

      if (!finalText) {
        throw new Error(
          `Failed to generate valid chunk for verses ${chunk.startVerse}-${chunk.endVerse}: ${lastReason}`,
        );
      }

      return { chunkIndex: chunk.chunkIndex, text: finalText };
    }),
  );

  return stitchBylineChunks(results);
}

export function shouldUseBylineChunking(
  explanationType: string,
  verseCount: number,
) {
  return explanationType === "byline" && verseCount > BYLINE_CHUNK_THRESHOLD;
}

export type BylineChunkPrompt = {
  prompt: string;
  startVerse: number;
  endVerse: number;
  chunkIndex: number;
  totalChunks: number;
};

/**
 * Build chunked prompts for batch/sync use without calling the API.
 * Returns an array of prompt objects, one per chunk.
 */
export function buildBylineChunkPrompts({
  verses,
  bookName,
  chapterNumber,
  bylineTemplate,
  chunkSize = BYLINE_CHUNK_SIZE,
}: {
  verses: BylineVerse[];
  bookName: string;
  chapterNumber: number;
  bylineTemplate: string;
  chunkSize?: number;
}): BylineChunkPrompt[] {
  const sortedVerses = [...verses].sort(
    (a, b) => a.verseNumber - b.verseNumber,
  );

  if (sortedVerses.length === 0) return [];

  const maxVerseNumber = sortedVerses[sortedVerses.length - 1].verseNumber;
  const firstVerse = sortedVerses[0].verseNumber;

  // Pre-calculate total chunks
  let totalChunks = 0;
  for (let s = firstVerse; s <= maxVerseNumber; s += chunkSize) totalChunks++;

  const prompts: BylineChunkPrompt[] = [];
  let chunkIndex = 0;

  for (
    let startVerse = firstVerse;
    startVerse <= maxVerseNumber;
    startVerse += chunkSize
  ) {
    const endVerse = Math.min(startVerse + chunkSize - 1, maxVerseNumber);
    const isFirst = startVerse === firstVerse;

    const versesText = sortedVerses
      .filter((v) => v.verseNumber >= startVerse && v.verseNumber <= endVerse)
      .map((v) => `${v.verseNumber}. ${v.text}`)
      .join("\n");

    prompts.push({
      prompt: buildRangePrompt({
        bookName,
        chapterNumber,
        startVerse,
        endVerse,
        versesText,
        isFirst,
        isRetry: false,
        bylineTemplate,
      }),
      startVerse,
      endVerse,
      chunkIndex,
      totalChunks,
    });

    chunkIndex++;
  }

  return prompts;
}

/**
 * Stitch ordered chunk texts back into a single explanation.
 */
export function stitchBylineChunks(
  chunks: Array<{ chunkIndex: number; text: string }>,
): string {
  return chunks
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((c) => c.text)
    .join("\n\n");
}
