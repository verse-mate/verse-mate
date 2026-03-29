import { describe, expect, it } from "bun:test";
import { stitchBylineChunks } from "../../shared/byline-chunking";

/**
 * Unit tests for batch operations chunked byline parsing.
 *
 * These tests simulate the exact JSONL output format from the OpenAI Batch API
 * and verify our custom_id regex, chunk collection, and stitching logic.
 *
 * The batch response format uses the Responses API (not Chat Completions):
 *   - output_text for the main text
 *   - usage.input_tokens / output_tokens
 */

// --- Helpers ---

const CHUNK_PATTERN =
  /^(.+)-(\d+)-byline-(\d+)-chunk-(\d+)-of-(\d+)-v(\d+)-(\d+)$/;

/** Build a fake batch JSONL response line (Responses API format) */
function makeBatchResponseLine({
  customId,
  text,
  inputTokens = 1000,
  outputTokens = 3000,
  statusCode = 200,
}: {
  customId: string;
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  statusCode?: number;
}) {
  return JSON.stringify({
    custom_id: customId,
    response: {
      status_code: statusCode,
      body: {
        output_text: text,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      },
    },
  });
}

/** Build a fake batch response using the fallback output[] format */
function makeBatchResponseLineAltFormat({
  customId,
  text,
}: {
  customId: string;
  text: string;
}) {
  return JSON.stringify({
    custom_id: customId,
    response: {
      status_code: 200,
      body: {
        output: [
          { type: "reasoning", content: [] },
          { type: "message", content: [{ type: "text", text }] },
        ],
        usage: { input_tokens: 1000, output_tokens: 3000 },
      },
    },
  });
}

function makeChunkText(
  bookName: string,
  chapter: number,
  startVerse: number,
  endVerse: number,
) {
  const lines: string[] = [];
  for (let v = startVerse; v <= endVerse; v++) {
    lines.push(
      `## ${bookName} ${chapter}:${v}\n> {verse:${bookName} ${chapter}:${v}}\n\n### Summary\nExplanation for verse ${v} of ${bookName} ${chapter}.`,
    );
  }
  return lines.join("\n\n");
}

// --- CHUNK_PATTERN regex tests ---

describe("CHUNK_PATTERN regex", () => {
  it("matches standard chunked custom_id", () => {
    const id = "psalms-119-byline-1060-chunk-0-of-5-v1-40";
    const match = id.match(CHUNK_PATTERN);
    expect(match).toBeTruthy();
    expect(match?.[1]).toBe("psalms"); // book slug
    expect(match?.[2]).toBe("119"); // chapter number
    expect(match?.[3]).toBe("1060"); // chapter_id
    expect(match?.[4]).toBe("0"); // chunk index
    expect(match?.[5]).toBe("5"); // total chunks
    expect(match?.[6]).toBe("1"); // start verse
    expect(match?.[7]).toBe("40"); // end verse
  });

  it("matches multi-word book slug", () => {
    const id = "1-chronicles-29-byline-500-chunk-2-of-3-v21-30";
    const match = id.match(CHUNK_PATTERN);
    expect(match).toBeTruthy();
    expect(match?.[1]).toBe("1-chronicles");
    expect(match?.[2]).toBe("29");
    expect(match?.[3]).toBe("500");
    expect(match?.[4]).toBe("2");
    expect(match?.[5]).toBe("3");
  });

  it("matches last chunk with smaller range", () => {
    const id = "psalms-119-byline-1060-chunk-4-of-5-v161-176";
    const match = id.match(CHUNK_PATTERN);
    expect(match).toBeTruthy();
    expect(match?.[4]).toBe("4");
    expect(match?.[6]).toBe("161");
    expect(match?.[7]).toBe("176");
  });

  it("does NOT match non-chunked custom_id (4-part format)", () => {
    const id = "genesis-1-summary-42";
    const match = id.match(CHUNK_PATTERN);
    expect(match).toBeNull();
  });

  it("does NOT match non-chunked byline custom_id", () => {
    const id = "genesis-1-byline-42";
    const match = id.match(CHUNK_PATTERN);
    expect(match).toBeNull();
  });

  it("does NOT match legacy 3-part format", () => {
    const id = "genesis-1-summary";
    const match = id.match(CHUNK_PATTERN);
    expect(match).toBeNull();
  });
});

// --- Chunk collection + stitching simulation ---

describe("batch output chunk collection and stitching", () => {
  /**
   * Simulates the exact loop from processOutputFile:
   * 1. Parse each JSONL line
   * 2. Extract text (output_text or fallback output[].content)
   * 3. Match CHUNK_PATTERN on custom_id
   * 4. Collect chunks in map
   * 5. Stitch complete sets
   */
  function simulateProcessOutputFile(jsonlLines: string[]) {
    const bylineChunkCollector = new Map<
      string,
      {
        chapterNumber: number;
        chapterId: number;
        totalChunks: number;
        chunks: Array<{ chunkIndex: number; text: string }>;
      }
    >();

    const nonChunkedResults: Array<{
      customId: string;
      type: string;
      text: string;
    }> = [];

    let processedCount = 0;
    let errorCount = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    for (const line of jsonlLines) {
      const parsedLine = JSON.parse(line);

      if (parsedLine.response?.body?.usage) {
        totalPromptTokens += parsedLine.response.body.usage.input_tokens || 0;
        totalCompletionTokens +=
          parsedLine.response.body.usage.output_tokens || 0;
      }

      const responseBody = parsedLine.response?.body;
      const outputText: string | undefined = responseBody?.output_text;
      let extractedText: string | undefined = outputText;

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
        } else {
          // Non-chunked: extract type from custom_id
          const parts = parsedLine.custom_id.split("-");
          nonChunkedResults.push({
            customId: parsedLine.custom_id,
            type: parts[parts.length - 2] || "unknown",
            text: extractedText,
          });
          processedCount++;
        }
      } else {
        errorCount++;
      }
    }

    // Stitch complete chunk sets
    const stitchedResults: Array<{
      chapterId: number;
      chapterNumber: number;
      text: string;
    }> = [];

    for (const [, collected] of bylineChunkCollector) {
      if (collected.chunks.length < collected.totalChunks) {
        errorCount++;
        continue;
      }
      stitchedResults.push({
        chapterId: collected.chapterId,
        chapterNumber: collected.chapterNumber,
        text: stitchBylineChunks(collected.chunks),
      });
      processedCount++;
    }

    return {
      stitchedResults,
      nonChunkedResults,
      processedCount,
      errorCount,
      totalPromptTokens,
      totalCompletionTokens,
    };
  }

  it("collects and stitches 5 chunks for Psalms 119", () => {
    const lines = [
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-0-of-5-v1-40",
        text: makeChunkText("Psalms", 119, 1, 40),
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-1-of-5-v41-80",
        text: makeChunkText("Psalms", 119, 41, 80),
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-2-of-5-v81-120",
        text: makeChunkText("Psalms", 119, 81, 120),
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-3-of-5-v121-160",
        text: makeChunkText("Psalms", 119, 121, 160),
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-4-of-5-v161-176",
        text: makeChunkText("Psalms", 119, 161, 176),
      }),
    ];

    const result = simulateProcessOutputFile(lines);

    expect(result.stitchedResults).toHaveLength(1);
    expect(result.stitchedResults[0].chapterId).toBe(1060);
    expect(result.stitchedResults[0].chapterNumber).toBe(119);
    expect(result.processedCount).toBe(1);
    expect(result.errorCount).toBe(0);

    // Verify stitched output contains all verses
    const stitched = result.stitchedResults[0].text;
    expect(stitched).toContain("119:1");
    expect(stitched).toContain("119:40");
    expect(stitched).toContain("119:41");
    expect(stitched).toContain("119:176");
    expect(stitched).toContain("{verse:Psalms 119:1}");
    expect(stitched).toContain("{verse:Psalms 119:176}");
  });

  it("handles chunks arriving out of order", () => {
    const lines = [
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-4-of-5-v161-176",
        text: makeChunkText("Psalms", 119, 161, 176),
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-1-of-5-v41-80",
        text: makeChunkText("Psalms", 119, 41, 80),
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-3-of-5-v121-160",
        text: makeChunkText("Psalms", 119, 121, 160),
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-0-of-5-v1-40",
        text: makeChunkText("Psalms", 119, 1, 40),
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-2-of-5-v81-120",
        text: makeChunkText("Psalms", 119, 81, 120),
      }),
    ];

    const result = simulateProcessOutputFile(lines);

    expect(result.stitchedResults).toHaveLength(1);
    expect(result.errorCount).toBe(0);

    // Verify stitching reorders correctly — verse 1 should come before verse 41
    const stitched = result.stitchedResults[0].text;
    const pos1 = stitched.indexOf("119:1\n");
    const pos41 = stitched.indexOf("119:41\n");
    const pos161 = stitched.indexOf("119:161\n");
    expect(pos1).toBeLessThan(pos41);
    expect(pos41).toBeLessThan(pos161);
  });

  it("handles mixed chunked and non-chunked lines in same batch", () => {
    const lines = [
      // Non-chunked summary for Psalms 119
      makeBatchResponseLine({
        customId: "psalms-119-summary-1060",
        text: "# Summary of Psalms 119\n\nThis is a summary...",
      }),
      // Chunked byline for Psalms 119
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-0-of-2-v1-40",
        text: makeChunkText("Psalms", 119, 1, 40),
      }),
      // Non-chunked detailed for Psalms 119
      makeBatchResponseLine({
        customId: "psalms-119-detailed-1060",
        text: "# In-Depth Analysis of Psalms 119\n\nDetailed...",
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-1-of-2-v41-80",
        text: makeChunkText("Psalms", 119, 41, 80),
      }),
    ];

    const result = simulateProcessOutputFile(lines);

    expect(result.nonChunkedResults).toHaveLength(2);
    expect(result.stitchedResults).toHaveLength(1);
    expect(result.processedCount).toBe(3); // 2 non-chunked + 1 stitched
    expect(result.errorCount).toBe(0);
  });

  it("reports error for incomplete chunk set", () => {
    const lines = [
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-0-of-3-v1-40",
        text: makeChunkText("Psalms", 119, 1, 40),
      }),
      // chunk 1 missing
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-2-of-3-v81-120",
        text: makeChunkText("Psalms", 119, 81, 120),
      }),
    ];

    const result = simulateProcessOutputFile(lines);

    expect(result.stitchedResults).toHaveLength(0);
    expect(result.errorCount).toBe(1);
  });

  it("handles multiple chapters with chunks in same batch", () => {
    const lines = [
      // Numbers 7 (chapter_id=200): 3 chunks
      makeBatchResponseLine({
        customId: "numbers-7-byline-200-chunk-0-of-3-v1-40",
        text: makeChunkText("Numbers", 7, 1, 40),
      }),
      // Psalms 119 (chapter_id=1060): 2 chunks
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-0-of-2-v1-40",
        text: makeChunkText("Psalms", 119, 1, 40),
      }),
      makeBatchResponseLine({
        customId: "numbers-7-byline-200-chunk-1-of-3-v41-80",
        text: makeChunkText("Numbers", 7, 41, 80),
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-1-of-2-v41-80",
        text: makeChunkText("Psalms", 119, 41, 80),
      }),
      makeBatchResponseLine({
        customId: "numbers-7-byline-200-chunk-2-of-3-v81-89",
        text: makeChunkText("Numbers", 7, 81, 89),
      }),
    ];

    const result = simulateProcessOutputFile(lines);

    expect(result.stitchedResults).toHaveLength(2);
    expect(result.processedCount).toBe(2);
    expect(result.errorCount).toBe(0);

    const psalms = result.stitchedResults.find((r) => r.chapterId === 1060);
    const numbers = result.stitchedResults.find((r) => r.chapterId === 200);
    expect(psalms).toBeTruthy();
    expect(numbers).toBeTruthy();
    expect(psalms?.text).toContain("119:1");
    expect(numbers?.text).toContain("7:89");
  });

  it("handles failed chunk response (non-200 status)", () => {
    const lines = [
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-0-of-2-v1-40",
        text: makeChunkText("Psalms", 119, 1, 40),
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-1-of-2-v41-80",
        text: "",
        statusCode: 500,
      }),
    ];

    const result = simulateProcessOutputFile(lines);

    // chunk 1 fails (empty text + 500), so only 1 of 2 collected → incomplete
    expect(result.stitchedResults).toHaveLength(0);
    expect(result.errorCount).toBe(2); // 1 for failed response + 1 for incomplete set
  });

  it("extracts text from fallback output[] format", () => {
    const lines = [
      makeBatchResponseLineAltFormat({
        customId: "psalms-119-byline-1060-chunk-0-of-1-v1-40",
        text: makeChunkText("Psalms", 119, 1, 40),
      }),
    ];

    const result = simulateProcessOutputFile(lines);

    expect(result.stitchedResults).toHaveLength(1);
    expect(result.stitchedResults[0].text).toContain("119:1");
  });

  it("tracks token usage across all chunks", () => {
    const lines = [
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-0-of-2-v1-40",
        text: makeChunkText("Psalms", 119, 1, 40),
        inputTokens: 2000,
        outputTokens: 5000,
      }),
      makeBatchResponseLine({
        customId: "psalms-119-byline-1060-chunk-1-of-2-v41-80",
        text: makeChunkText("Psalms", 119, 41, 80),
        inputTokens: 2100,
        outputTokens: 5200,
      }),
    ];

    const result = simulateProcessOutputFile(lines);

    expect(result.totalPromptTokens).toBe(4100);
    expect(result.totalCompletionTokens).toBe(10200);
  });
});

// --- JSONL generation format tests ---

describe("batch JSONL custom_id format", () => {
  it("generates correct custom_id for chunked byline", () => {
    const bookSlug = "psalms";
    const chapterNumber = 119;
    const chapterId = 1060;
    const chunkIndex = 2;
    const totalChunks = 5;
    const startVerse = 81;
    const endVerse = 120;

    const customId = `${bookSlug}-${chapterNumber}-byline-${chapterId}-chunk-${chunkIndex}-of-${totalChunks}-v${startVerse}-${endVerse}`;

    expect(customId).toBe("psalms-119-byline-1060-chunk-2-of-5-v81-120");

    // Verify it matches the parser regex
    const match = customId.match(CHUNK_PATTERN);
    expect(match).toBeTruthy();
    expect(Number.parseInt(match?.[2] ?? "", 10)).toBe(chapterNumber);
    expect(Number.parseInt(match?.[3] ?? "", 10)).toBe(chapterId);
    expect(Number.parseInt(match?.[4] ?? "", 10)).toBe(chunkIndex);
    expect(Number.parseInt(match?.[5] ?? "", 10)).toBe(totalChunks);
    expect(Number.parseInt(match?.[6] ?? "", 10)).toBe(startVerse);
    expect(Number.parseInt(match?.[7] ?? "", 10)).toBe(endVerse);
  });

  it("generates correct custom_id for multi-word book", () => {
    const customId = "1-chronicles-29-byline-500-chunk-0-of-2-v1-40";
    const match = customId.match(CHUNK_PATTERN);
    expect(match).toBeTruthy();
    expect(match?.[1]).toBe("1-chronicles");
  });

  it("non-chunked byline custom_id does NOT match chunk pattern", () => {
    const customId = "genesis-3-byline-42";
    expect(customId.match(CHUNK_PATTERN)).toBeNull();
  });
});
