import { describe, expect, it } from "bun:test";
import {
  BYLINE_CHUNK_SIZE,
  BYLINE_CHUNK_THRESHOLD,
  type BylineVerse,
  MIN_SUMMARY_SENTENCES,
  countSentences,
  extractVerseSummaries,
  generateChunkedByline,
  shouldUseBylineChunking,
  splitBylineForTranslation,
  stitchBylineChunks,
  toBylineVerses,
  validateSummaryLengths,
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

// --- splitBylineForTranslation ---

function makeStitchedByline(
  verseCount: number,
  bookName = "Psalms",
  chapter = 119,
) {
  const parts = [`# Line-by-Line Analysis of ${bookName} ${chapter}\n`];
  for (let v = 1; v <= verseCount; v++) {
    parts.push(
      `## ${bookName} ${chapter}:${v}\n> {verse:${bookName} ${chapter}:${v}}\n\n### Summary\nExplanation for verse ${v}.`,
    );
  }
  return parts.join("\n\n");
}

describe("splitBylineForTranslation", () => {
  it("returns single chunk for short byline (under threshold)", () => {
    const text = makeStitchedByline(BYLINE_CHUNK_THRESHOLD);
    const chunks = splitBylineForTranslation(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].totalChunks).toBe(1);
    expect(chunks[0].text).toBe(text);
  });

  it("splits long byline into multiple chunks", () => {
    const text = makeStitchedByline(176); // Psalms 119 size
    const chunks = splitBylineForTranslation(text);

    // 176 verses / 40 chunk size = ceil(4.4) = 5 chunks
    expect(chunks).toHaveLength(5);
    expect(chunks[0].verseCount).toBe(40);
    expect(chunks[1].verseCount).toBe(40);
    expect(chunks[2].verseCount).toBe(40);
    expect(chunks[3].verseCount).toBe(40);
    expect(chunks[4].verseCount).toBe(16);

    // Total verse count matches
    const totalVerses = chunks.reduce((s, c) => s + c.verseCount, 0);
    expect(totalVerses).toBe(176);
  });

  it("keeps the title on chunk 0 only", () => {
    const text = makeStitchedByline(176);
    const chunks = splitBylineForTranslation(text);

    expect(chunks[0].text).toContain("# Line-by-Line Analysis of Psalms 119");
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].text).not.toContain(
        "# Line-by-Line Analysis of Psalms 119",
      );
      expect(chunks[i].text.startsWith("## ")).toBe(true);
    }
  });

  it("preserves all verses across chunks (no gaps, no overlaps)", () => {
    const text = makeStitchedByline(176);
    const chunks = splitBylineForTranslation(text);

    const allVerses: number[] = [];
    for (const chunk of chunks) {
      const matches = [...chunk.text.matchAll(/^## Psalms 119:(\d+)/gm)];
      for (const m of matches) {
        allVerses.push(Number.parseInt(m[1], 10));
      }
    }

    // Exactly 176 unique verses 1..176, in order
    expect(allVerses.length).toBe(176);
    expect(new Set(allVerses).size).toBe(176);
    expect(allVerses[0]).toBe(1);
    expect(allVerses[allVerses.length - 1]).toBe(176);
    for (let i = 1; i < allVerses.length; i++) {
      expect(allVerses[i]).toBe(allVerses[i - 1] + 1);
    }
  });

  it("handles exactly threshold+1 verses", () => {
    const text = makeStitchedByline(BYLINE_CHUNK_THRESHOLD + 1);
    const chunks = splitBylineForTranslation(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("uses custom chunk size and threshold", () => {
    const text = makeStitchedByline(100);
    const chunks = splitBylineForTranslation(text, 25, 50);
    // 100 verses / 25 = 4 chunks
    expect(chunks).toHaveLength(4);
    expect(chunks[0].verseCount).toBe(25);
    expect(chunks[3].verseCount).toBe(25);
  });

  it("roundtrip: split then stitch recovers all headings", () => {
    const text = makeStitchedByline(100);
    const chunks = splitBylineForTranslation(text);
    const stitched = stitchBylineChunks(
      chunks.map((c) => ({ chunkIndex: c.chunkIndex, text: c.text })),
    );

    const originalHeadings = (text.match(/^## Psalms 119:\d+/gm) || []).length;
    const stitchedHeadings = (stitched.match(/^## Psalms 119:\d+/gm) || [])
      .length;
    expect(stitchedHeadings).toBe(originalHeadings);
  });

  it("includes complete text content of each verse", () => {
    const text = makeStitchedByline(50);
    const chunks = splitBylineForTranslation(text, 20, 10); // force 3 chunks

    // Every chunk should have its summaries
    for (const chunk of chunks) {
      const headings = (chunk.text.match(/^## Psalms 119:\d+/gm) || []).length;
      const summaries = (chunk.text.match(/### Summary/g) || []).length;
      const verseRefs = (chunk.text.match(/\{verse:Psalms 119:\d+\}/g) || [])
        .length;
      expect(summaries).toBe(headings);
      expect(verseRefs).toBe(headings);
    }
  });
});

// --- countSentences ---

describe("countSentences", () => {
  it("returns 0 for empty/whitespace input", () => {
    expect(countSentences("")).toBe(0);
    expect(countSentences("   \n\t  ")).toBe(0);
  });

  it("counts simple terminal punctuation", () => {
    expect(countSentences("One sentence.")).toBe(1);
    expect(countSentences("First. Second. Third.")).toBe(3);
    expect(countSentences("Hi! Bye? Done.")).toBe(3);
  });

  it("does not count abbreviations as sentence ends", () => {
    expect(
      countSentences(
        "Paul cites the Law (e.g. Deuteronomy) repeatedly. He calls believers to faith. He concludes with a doxology.",
      ),
    ).toBe(3);
    expect(
      countSentences(
        "Compare vs. 5. The author makes a sharp pivot. Then he restates the claim.",
      ),
    ).toBe(3);
  });

  it("ignores blockquoted verse text", () => {
    const block =
      '> "God spoke long ago."\nThis verse opens the chapter. It introduces the theme. It anchors the rest.';
    expect(countSentences(block)).toBe(3);
  });

  it("strips markdown emphasis before counting", () => {
    expect(countSentences("**Bold thing.** *italic thing.* Plain thing.")).toBe(
      3,
    );
  });

  it("handles a trailing fragment with no punctuation as zero extra", () => {
    // We do not count fragments without terminal punctuation.
    expect(countSentences("One sentence. trailing fragment")).toBe(1);
  });
});

// --- extractVerseSummaries ---

describe("extractVerseSummaries", () => {
  it("extracts per-verse Summary blocks", () => {
    const out = [
      "# Line-by-Line Analysis of Hebrews 1",
      "",
      "## Hebrews 1:1",
      '> "God, after He spoke long ago"',
      "",
      "### Summary",
      "This verse opens the letter. It declares God's past speech. It anchors the chapter.",
      "",
      "### Analysis",
      "**Point one:**",
      "- bullet",
      "",
      "## Hebrews 1:2",
      '> "in these last days"',
      "",
      "### Summary",
      "Short.",
      "",
      "### Analysis",
      "- bullet",
    ].join("\n");

    const summaries = extractVerseSummaries(out);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].verseHeading).toBe("Hebrews 1:1");
    expect(summaries[1].verseHeading).toBe("Hebrews 1:2");
    expect(summaries[0].summary).toContain("It anchors the chapter.");
    expect(summaries[1].summary).toBe("Short.");
  });

  it("returns empty array when no ### Summary blocks exist", () => {
    const out = "# Summary of Hebrews 1\n\nThis is a summary explanation type.";
    expect(extractVerseSummaries(out)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(extractVerseSummaries("")).toEqual([]);
  });
});

// --- validateSummaryLengths ---

describe("validateSummaryLengths", () => {
  function makeBylineSection(verseRef: string, summary: string) {
    return [
      `## ${verseRef}`,
      "> verse text",
      "",
      "### Summary",
      summary,
      "",
      "### Analysis",
      "- bullet",
    ].join("\n");
  }

  it("passes when every Summary has at least MIN_SUMMARY_SENTENCES sentences", () => {
    const out = [
      makeBylineSection(
        "Hebrews 1:1",
        "First sentence. Second sentence. Third sentence.",
      ),
      makeBylineSection(
        "Hebrews 1:2",
        "Alpha sentence. Beta sentence. Gamma sentence.",
      ),
    ].join("\n\n");

    const v = validateSummaryLengths(out);
    expect(v.valid).toBe(true);
    expect(v.shortSummaries).toEqual([]);
  });

  it("fails when any Summary has fewer than MIN_SUMMARY_SENTENCES sentences", () => {
    const out = [
      makeBylineSection(
        "Hebrews 1:1",
        "First sentence. Second sentence. Third sentence.",
      ),
      makeBylineSection("Hebrews 1:2", "Just one short sentence."),
    ].join("\n\n");

    const v = validateSummaryLengths(out);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe("summary-too-short");
    expect(v.shortSummaries).toHaveLength(1);
    expect(v.shortSummaries[0].verseHeading).toBe("Hebrews 1:2");
    expect(v.shortSummaries[0].sentenceCount).toBe(1);
  });

  it("treats no `### Summary` sections as valid (non-byline output)", () => {
    const out = "# Summary of Hebrews 1\n\nThis is the chapter-level summary.";
    const v = validateSummaryLengths(out);
    expect(v.valid).toBe(true);
    expect(v.reason).toBe("no-summaries");
  });

  it("respects custom minSentences param", () => {
    const out = makeBylineSection("Hebrews 1:1", "Short. Sentence.");
    expect(validateSummaryLengths(out, 2).valid).toBe(true);
    expect(validateSummaryLengths(out, 3).valid).toBe(false);
  });

  it("MIN_SUMMARY_SENTENCES is 3 per VER-120", () => {
    expect(MIN_SUMMARY_SENTENCES).toBe(3);
  });
});

// --- generateChunkedByline summary-quality retry ---

describe("generateChunkedByline summary-length validation", () => {
  function verseSection(verseRef: string, summary: string) {
    return [
      `## ${verseRef}`,
      "> verse text",
      "",
      "### Summary",
      summary,
      "",
      "### Analysis",
      "- a",
    ].join("\n");
  }

  it("retries when a per-verse Summary is too short and accepts the corrected output", async () => {
    let callCount = 0;
    const verses = makeVerses(2);

    const result = await generateChunkedByline({
      verses,
      bookName: "Genesis",
      chapterNumber: 1,
      bylineTemplate: "test template",
      maxRetries: 1,
      generateChunk: async () => {
        callCount++;
        if (callCount === 1) {
          // First attempt has the right verse boundaries but a short Summary on verse 2.
          return [
            verseSection("Genesis 1:1", "First. Second. Third."),
            verseSection("Genesis 1:2", "Only one."),
          ].join("\n\n");
        }
        // Retry returns valid summaries.
        return [
          verseSection(
            "Genesis 1:1",
            "First sentence. Second sentence. Third sentence.",
          ),
          verseSection(
            "Genesis 1:2",
            "Alpha sentence. Beta sentence. Gamma sentence.",
          ),
        ].join("\n\n");
      },
    });

    expect(callCount).toBe(2);
    expect(result).toContain("Alpha sentence.");
  });

  it("throws after exhausting retries when summaries remain short", async () => {
    const verses = makeVerses(2);

    await expect(
      generateChunkedByline({
        verses,
        bookName: "Genesis",
        chapterNumber: 1,
        bylineTemplate: "test template",
        maxRetries: 1,
        generateChunk: async () => {
          return [
            verseSection(
              "Genesis 1:1",
              "First sentence. Second sentence. Third sentence.",
            ),
            verseSection("Genesis 1:2", "Still too short."),
          ].join("\n\n");
        },
      }),
    ).rejects.toThrow("summary-too-short");
  });
});
