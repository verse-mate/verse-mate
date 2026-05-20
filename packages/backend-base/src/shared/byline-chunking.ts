export const BYLINE_CHUNK_SIZE = 40;
export const BYLINE_CHUNK_THRESHOLD = 50;
/**
 * Minimum number of sentences required in a byline per-verse `### Summary`
 * section. Below this we treat the chunk as invalid and retry. The product
 * quality bar is "at least 3 sentences" — see VER-120.
 */
export const MIN_SUMMARY_SENTENCES = 3;

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

export type ShortSummary = {
  verseHeading: string;
  sentenceCount: number;
};

type ChunkCoverage = {
  valid: boolean;
  reason: string;
  mentionsInRange: number[];
  shortSummaries?: ShortSummary[];
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
    prompt += `\n\n- Previous attempt did not fully cover the required range. Ensure you include every verse from ${startVerse} to ${endVerse}, and that each verse's "### Summary" section contains at least ${MIN_SUMMARY_SENTENCES} complete sentences of prose.`;
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

/**
 * Abbreviations whose internal `.` should not be treated as a sentence
 * terminator when counting sentences. Tuned for the prose style of biblical
 * commentary (citations, scholarly hedging).
 */
const SENTENCE_COUNT_ABBREVIATIONS = [
  "e.g.",
  "i.e.",
  "cf.",
  "etc.",
  "vs.",
  "v.",
  "vv.",
  "ch.",
  "chap.",
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "St.",
];

/**
 * Count terminal-punctuation sentences in a prose block. Strips markdown
 * formatting and `>` blockquotes (verse-text quotes) first, then masks common
 * abbreviations so their internal periods don't get counted.
 *
 * Heuristic: counts runs of `.!?` (possibly followed by close-quote/paren)
 * that are followed by whitespace or end-of-string. Intentionally simple — we
 * only need to reliably flag obviously-short summaries (1–2 sentences).
 */
export function countSentences(text: string): number {
  if (!text) return 0;

  let cleaned = text
    // Strip blockquote lines (verse-text quotes are rendered as `> ...`).
    .replace(/^>.*$/gm, "")
    // Strip markdown emphasis markers.
    .replace(/[*_`]/g, "")
    // Collapse whitespace.
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return 0;

  for (const abbr of SENTENCE_COUNT_ABBREVIATIONS) {
    cleaned = cleaned.split(abbr).join(abbr.replace(/\./g, "·"));
  }

  const matches = cleaned.match(/[.!?]+["')\]]*(?=\s|$)/g);
  return matches ? matches.length : 0;
}

export type VerseSummary = {
  verseHeading: string;
  summary: string;
};

/**
 * Extract per-verse `### Summary` blocks from a byline explanation chunk.
 * Each `## Book Ch:V` section is expected to contain a `### Summary` block
 * (followed optionally by `### Analysis`).
 */
export function extractVerseSummaries(output: string): VerseSummary[] {
  if (!output) return [];

  const results: VerseSummary[] = [];
  const sections = output.split(/(?=^##\s)/m);

  for (const section of sections) {
    const headingMatch = section.match(/^##\s+(.+)$/m);
    if (!headingMatch) continue;

    const summaryMatch = section.match(
      /^###\s*Summary\s*\n([\s\S]*?)(?=^###\s|^##\s|$)/m,
    );
    if (!summaryMatch) continue;

    const summary = summaryMatch[1].trim();
    if (!summary) continue;

    results.push({
      verseHeading: headingMatch[1].trim(),
      summary,
    });
  }

  return results;
}

export type SummaryValidation = {
  valid: boolean;
  reason: string;
  shortSummaries: ShortSummary[];
};

/**
 * Validate that every per-verse `### Summary` in a byline output meets the
 * minimum sentence count. Returns `valid: true` with reason `no-summaries`
 * when no `### Summary` sections are present (e.g. non-byline output) — the
 * caller decides whether that's acceptable.
 */
export function validateSummaryLengths(
  output: string,
  minSentences: number = MIN_SUMMARY_SENTENCES,
): SummaryValidation {
  const summaries = extractVerseSummaries(output);
  if (summaries.length === 0) {
    return { valid: true, reason: "no-summaries", shortSummaries: [] };
  }

  const shortSummaries = summaries
    .map((s) => ({
      verseHeading: s.verseHeading,
      sentenceCount: countSentences(s.summary),
    }))
    .filter((s) => s.sentenceCount < minSentences);

  if (shortSummaries.length === 0) {
    return { valid: true, reason: "ok", shortSummaries: [] };
  }

  return {
    valid: false,
    reason: "summary-too-short",
    shortSummaries,
  };
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

  const summaryCheck = validateSummaryLengths(output);
  if (!summaryCheck.valid) {
    return {
      valid: false,
      reason: summaryCheck.reason,
      mentionsInRange,
      shortSummaries: summaryCheck.shortSummaries,
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
      const shortDetail = coverage.shortSummaries?.length
        ? `, short summaries: ${formatShortSummaryList(coverage.shortSummaries)}`
        : "";
      console.warn(
        `${attemptLabel} invalid (${coverage.reason}), mentions in range: [${coverage.mentionsInRange.join(", ")}]${shortDetail}`,
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

function formatShortSummaryList(short: ShortSummary[]): string {
  return short
    .slice(0, 5)
    .map((s) => `${s.verseHeading} (${s.sentenceCount})`)
    .join(", ");
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
        const shortDetail = coverage.shortSummaries?.length
          ? `, short summaries: ${formatShortSummaryList(coverage.shortSummaries)}`
          : "";
        console.warn(
          `${attemptLabel} invalid (${coverage.reason}), mentions: [${coverage.mentionsInRange.join(", ")}]${shortDetail}`,
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

export type BylineTranslationChunk = {
  text: string;
  chunkIndex: number;
  totalChunks: number;
  verseCount: number;
};

/**
 * Split a stitched byline (source language) into translation-friendly chunks.
 * Each chunk contains up to `chunkSize` `## Book Ch:V` sections. Chunk 0 keeps
 * any preamble (e.g. the `# Line-by-Line Analysis...` title). Returns a single
 * chunk if the explanation has <= threshold verse headings.
 */
export function splitBylineForTranslation(
  explanation: string,
  chunkSize = BYLINE_CHUNK_SIZE,
  threshold = BYLINE_CHUNK_THRESHOLD,
): BylineTranslationChunk[] {
  const headingRegex = /^##\s/gm;
  const headingIndices: number[] = [];
  for (const match of explanation.matchAll(headingRegex)) {
    if (match.index !== undefined) headingIndices.push(match.index);
  }

  // Not long enough to chunk — return as single chunk
  if (headingIndices.length <= threshold) {
    return [
      {
        text: explanation,
        chunkIndex: 0,
        totalChunks: 1,
        verseCount: headingIndices.length,
      },
    ];
  }

  const totalChunks = Math.ceil(headingIndices.length / chunkSize);
  const chunks: BylineTranslationChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const startHeadingIdx = i * chunkSize;
    const endHeadingIdx = Math.min(
      startHeadingIdx + chunkSize,
      headingIndices.length,
    );

    // Chunk 0 starts at the beginning of the explanation (keeps the title/preamble).
    // Subsequent chunks start at their first heading.
    const textStart = i === 0 ? 0 : headingIndices[startHeadingIdx];
    // Text ends right before the next chunk's first heading, or at EOF for the last chunk.
    const textEnd =
      endHeadingIdx < headingIndices.length
        ? headingIndices[endHeadingIdx]
        : explanation.length;

    chunks.push({
      text: explanation.slice(textStart, textEnd).trim(),
      chunkIndex: i,
      totalChunks,
      verseCount: endHeadingIdx - startHeadingIdx,
    });
  }

  return chunks;
}
