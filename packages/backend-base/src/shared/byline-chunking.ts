export const BYLINE_CHUNK_SIZE = 40;
export const BYLINE_CHUNK_THRESHOLD = 50;

type Effort = "low" | "medium" | "high";

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
  language: string;
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
  verses: Array<{ verse_number?: number; verseNumber?: number; text: string }>,
): BylineVerse[] {
  return verses
    .map((v) => ({
      verseNumber: v.verse_number ?? v.verseNumber ?? 0,
      text: v.text,
    }))
    .filter((v) => Number.isFinite(v.verseNumber) && v.verseNumber > 0)
    .sort((a, b) => a.verseNumber - b.verseNumber);
}

function buildRangePrompt({
  bookName,
  chapterNumber,
  language,
  startVerse,
  endVerse,
  versesText,
  isFirst,
  isRetry,
}: {
  bookName: string;
  chapterNumber: number;
  language: string;
  startVerse: number;
  endVerse: number;
  versesText: string;
  isFirst: boolean;
  isRetry: boolean;
}) {
  return `${isFirst ? `# ${bookName} ${chapterNumber}: Verse-by-Verse Analysis\n\n` : ""}Provide a verse-by-verse explanation for **verses ${startVerse} through ${endVerse}** of this chapter. For each verse:
1. Quote the verse using blockquote format (>)
2. Provide a clear summary
3. Include relevant key takeaways
4. Add key definitions as appropriate
5. Highlight theological themes as appropriate

CRITICAL INSTRUCTIONS:
- ONLY cover verses ${startVerse} through ${endVerse}
- Keep chronological order at all times
- Do not group verses unless absolutely necessary
- Ensure takeaways and themes are full sentences
- Use proper markdown formatting with line breaks
- Include explicit verse headings for each verse in the range (e.g. "## ${bookName} ${chapterNumber}:1")
${!isFirst ? "- Do NOT include a title heading - this is a continuation" : ""}
${isRetry ? "- Previous attempt did not fully cover the required range. Ensure you include every verse in this range." : ""}

Biblical Text (${bookName} ${chapterNumber} verses ${startVerse}-${endVerse}):
${versesText}

The response should be in ${language} using Markdown format only.`;
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
  language,
  chunkSize = BYLINE_CHUNK_SIZE,
  maxRetries = 1,
  logPrefix = "[BYLINE_CHUNK]",
  generateChunk,
}: GenerateChunkedBylineParams): Promise<string> {
  const sortedVerses = [...verses].sort(
    (a, b) => a.verseNumber - b.verseNumber,
  );
  const totalVerses = sortedVerses.length;

  if (totalVerses === 0) {
    throw new Error("Cannot chunk byline generation without verses");
  }

  const chunks: string[] = [];

  for (let startVerse = 1; startVerse <= totalVerses; startVerse += chunkSize) {
    const endVerse = Math.min(startVerse + chunkSize - 1, totalVerses);
    const isFirst = startVerse === 1;

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
        language,
        startVerse,
        endVerse,
        versesText,
        isFirst,
        isRetry: attempt > 0,
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

  return chunks.join("\n\n---\n\n");
}

export function shouldUseBylineChunking(
  explanationType: string,
  verseCount: number,
) {
  return explanationType === "byline" && verseCount > BYLINE_CHUNK_THRESHOLD;
}

export function normalizeEffort(value: string): Effort {
  if (value === "low" || value === "high") {
    return value;
  }
  return "medium";
}
