import { describe, expect, it } from "bun:test";
import {
  BYLINE_CHUNK_SIZE,
  BYLINE_CHUNK_THRESHOLD,
  type BylineVerse,
  generateChunkedByline,
  shouldUseBylineChunking,
  toBylineVerses,
} from "./byline-chunking";

// --- toBylineVerses ---

describe("toBylineVerses", () => {
  it("accepts verse_number (DB row format)", () => {
    const result = toBylineVerses([
      { verse_number: 2, text: "b" },
      { verse_number: 1, text: "a" },
    ]);
    expect(result).toEqual([
      { verseNumber: 1, text: "a" },
      { verseNumber: 2, text: "b" },
    ]);
  });

  it("accepts verseNumber (camelCase format)", () => {
    const result = toBylineVerses([
      { verseNumber: 3, text: "c" },
      { verseNumber: 1, text: "a" },
    ]);
    expect(result).toEqual([
      { verseNumber: 1, text: "a" },
      { verseNumber: 3, text: "c" },
    ]);
  });

  it("accepts verseId (parseBibleData format)", () => {
    const result = toBylineVerses([
      { verseId: 5, text: "e" },
      { verseId: 2, text: "b" },
    ]);
    expect(result).toEqual([
      { verseNumber: 2, text: "b" },
      { verseNumber: 5, text: "e" },
    ]);
  });

  it("prefers verse_number > verseNumber > verseId", () => {
    const result = toBylineVerses([
      { verse_number: 10, verseNumber: 20, verseId: 30, text: "x" },
    ]);
    expect(result[0].verseNumber).toBe(10);

    const result2 = toBylineVerses([
      { verseNumber: 20, verseId: 30, text: "x" },
    ]);
    expect(result2[0].verseNumber).toBe(20);
  });

  it("filters out zero and negative verse numbers", () => {
    const result = toBylineVerses([
      { verse_number: 0, text: "zero" },
      { verse_number: -1, text: "neg" },
      { verse_number: 1, text: "ok" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("ok");
  });

  it("filters out undefined/NaN verse numbers", () => {
    const result = toBylineVerses([
      { text: "no number" },
      { verse_number: Number.NaN, text: "nan" },
      { verseNumber: 1, text: "ok" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("returns sorted output", () => {
    const result = toBylineVerses([
      { verseId: 3, text: "c" },
      { verseId: 1, text: "a" },
      { verseId: 2, text: "b" },
    ]);
    expect(result.map((v) => v.verseNumber)).toEqual([1, 2, 3]);
  });

  it("handles empty array", () => {
    expect(toBylineVerses([])).toEqual([]);
  });
});

// --- shouldUseBylineChunking ---

describe("shouldUseBylineChunking", () => {
  it("returns true for byline with verses above threshold", () => {
    expect(shouldUseBylineChunking("byline", BYLINE_CHUNK_THRESHOLD + 1)).toBe(
      true,
    );
  });

  it("returns false for byline at threshold", () => {
    expect(shouldUseBylineChunking("byline", BYLINE_CHUNK_THRESHOLD)).toBe(
      false,
    );
  });

  it("returns false for byline below threshold", () => {
    expect(shouldUseBylineChunking("byline", 10)).toBe(false);
  });

  it("returns false for non-byline types regardless of count", () => {
    expect(shouldUseBylineChunking("summary", 200)).toBe(false);
    expect(shouldUseBylineChunking("detailed", 200)).toBe(false);
  });
});

// --- generateChunkedByline ---

function makeVerses(count: number, startAt = 1): BylineVerse[] {
  return Array.from({ length: count }, (_, i) => ({
    verseNumber: startAt + i,
    text: `Verse text for ${startAt + i}.`,
  }));
}

function mockGenerator(bookName: string, chapterNumber: number) {
  return async ({
    startVerse,
    endVerse,
  }: { startVerse: number; endVerse: number }) => {
    const lines: string[] = [];
    for (let v = startVerse; v <= endVerse; v++) {
      lines.push(
        `## ${bookName} ${chapterNumber}:${v}\n> Verse ${v} text.\nExplanation for verse ${v}.`,
      );
    }
    return lines.join("\n\n");
  };
}

describe("generateChunkedByline", () => {
  it("generates single chunk for small chapter", async () => {
    const verses = makeVerses(10);
    const result = await generateChunkedByline({
      verses,
      bookName: "Genesis",
      chapterNumber: 1,
      bylineTemplate: "test template",
      chunkSize: 40,
      generateChunk: mockGenerator("Genesis", 1),
    });

    expect(result).toContain("Genesis 1:1");
    expect(result).toContain("Genesis 1:10");
    expect(result).not.toContain("---");
  });

  it("splits into correct number of chunks", async () => {
    const verses = makeVerses(100);
    const chunks: number[] = [];

    const result = await generateChunkedByline({
      verses,
      bookName: "Psalms",
      chapterNumber: 119,
      bylineTemplate: "test template",
      chunkSize: 40,
      generateChunk: async ({ startVerse, endVerse }) => {
        chunks.push(startVerse);
        return await mockGenerator("Psalms", 119)({ startVerse, endVerse });
      },
    });

    // 100 verses / 40 chunk size = 3 chunks (1-40, 41-80, 81-100)
    expect(chunks).toEqual([1, 41, 81]);

    // All 3 chunks should be present in the result
    expect(result).toContain("119:1");
    expect(result).toContain("119:100");
  });

  it("handles Psalms 119 size (176 verses)", async () => {
    const verses = makeVerses(176);
    const chunkRanges: Array<[number, number]> = [];

    const result = await generateChunkedByline({
      verses,
      bookName: "Psalms",
      chapterNumber: 119,
      bylineTemplate: "test template",
      chunkSize: BYLINE_CHUNK_SIZE,
      generateChunk: async ({ startVerse, endVerse }) => {
        chunkRanges.push([startVerse, endVerse]);
        return await mockGenerator("Psalms", 119)({ startVerse, endVerse });
      },
    });

    // 176 / 40 = 4.4 → 5 chunks
    expect(chunkRanges).toEqual([
      [1, 40],
      [41, 80],
      [81, 120],
      [121, 160],
      [161, 176],
    ]);

    // Verify first and last verse are mentioned
    expect(result).toContain("119:1");
    expect(result).toContain("119:176");
  });

  it("handles non-contiguous verse numbers", async () => {
    // Simulate a chapter where verse 5 is missing
    const verses: BylineVerse[] = [
      { verseNumber: 1, text: "One" },
      { verseNumber: 2, text: "Two" },
      { verseNumber: 3, text: "Three" },
      { verseNumber: 4, text: "Four" },
      // verse 5 missing
      { verseNumber: 6, text: "Six" },
      { verseNumber: 7, text: "Seven" },
    ];

    const result = await generateChunkedByline({
      verses,
      bookName: "TestBook",
      chapterNumber: 1,
      bylineTemplate: "test template",
      chunkSize: 40,
      generateChunk: mockGenerator("TestBook", 1),
    });

    expect(result).toContain("1:1");
    expect(result).toContain("1:7");
  });

  it("throws on empty verses", async () => {
    await expect(
      generateChunkedByline({
        verses: [],
        bookName: "Genesis",
        chapterNumber: 1,
        bylineTemplate: "test template",
        generateChunk: async () => "",
      }),
    ).rejects.toThrow("Cannot chunk byline generation without verses");
  });

  it("retries on invalid coverage and succeeds", async () => {
    let callCount = 0;
    const verses = makeVerses(10);

    const result = await generateChunkedByline({
      verses,
      bookName: "Genesis",
      chapterNumber: 1,
      bylineTemplate: "test template",
      maxRetries: 1,
      generateChunk: async ({ startVerse, endVerse }) => {
        callCount++;
        if (callCount === 1) {
          // First attempt: missing start verse
          return "## Genesis 1:5\nSome text\n## Genesis 1:10\nMore text";
        }
        // Retry: valid output
        return await mockGenerator("Test", 1)({ startVerse, endVerse });
      },
    });

    expect(callCount).toBe(2);
    expect(result).toContain("1:1");
  });

  it("throws after exhausting retries", async () => {
    const verses = makeVerses(10);

    await expect(
      generateChunkedByline({
        verses,
        bookName: "Genesis",
        chapterNumber: 1,
        bylineTemplate: "test template",
        maxRetries: 1,
        generateChunk: async () => "I cannot exceed the token limit for this.",
      }),
    ).rejects.toThrow("Failed to generate valid chunk");
  });

  it("detects model refusal", async () => {
    const verses = makeVerses(10);

    await expect(
      generateChunkedByline({
        verses,
        bookName: "Genesis",
        chapterNumber: 1,
        bylineTemplate: "test template",
        maxRetries: 0,
        generateChunk: async () =>
          "I'm sorry, I cannot generate this as it exceeds the token limit.",
      }),
    ).rejects.toThrow("model-refusal");
  });

  it("passes correct isFirst flag", async () => {
    const firstFlags: boolean[] = [];
    const verses = makeVerses(50);

    await generateChunkedByline({
      verses,
      bookName: "Test",
      chapterNumber: 1,
      bylineTemplate: "test template",
      chunkSize: 30,
      generateChunk: async ({ isFirst, startVerse, endVerse }) => {
        firstFlags.push(isFirst);
        return await mockGenerator("Test", 1)({ startVerse, endVerse });
      },
    });

    // 2 chunks: first=true, second=false
    expect(firstFlags).toEqual([true, false]);
  });
});
