import { describe, expect, it } from "bun:test";
import {
  type JesusPassageSpan,
  assessPassageByline,
  chaptersToFill,
  displaySpan,
  spanVerses,
  summarizeBylineCoverage,
} from "../utils/byline-coverage";

const span = (over: Partial<JesusPassageSpan> = {}): JesusPassageSpan => ({
  source: "event",
  slug: "repent",
  title: "Repent, for the kingdom of heaven is at hand",
  bookId: 41,
  bookName: "Mark",
  chapter: 1,
  verseStart: 14,
  verseEnd: 15,
  ...over,
});

/** A byline the way the generator writes one: `## Book C:V` then prose. */
function byline(chapter: number, verses: number[], bookName = "Mark") {
  return [
    `# Line-by-Line Analysis of ${bookName} ${chapter}`,
    ...verses.map(
      (v) =>
        `## ${bookName} ${chapter}:${v}\n\n> The verse text.\n\n### Summary\n\nWhat this verse says and why it matters.`,
    ),
  ].join("\n\n");
}

describe("displaySpan", () => {
  it("reads the way the passage pill does", () => {
    expect(displaySpan(span())).toBe("Mark 1:14-15");
    expect(displaySpan(span({ verseStart: 17, verseEnd: null }))).toBe(
      "Mark 1:17",
    );
    expect(displaySpan(span({ verseStart: 17, verseEnd: 17 }))).toBe(
      "Mark 1:17",
    );
    expect(displaySpan(span({ verseStart: null, verseEnd: null }))).toBe(
      "Mark 1",
    );
  });
});

describe("spanVerses", () => {
  it("expands a range", () => {
    expect(spanVerses(span(), 45)).toEqual([14, 15]);
  });

  it("treats a null start as the whole chapter", () => {
    expect(spanVerses(span({ verseStart: null, verseEnd: null }), 4)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("treats a null end as a single verse", () => {
    expect(spanVerses(span({ verseStart: 14, verseEnd: null }), 45)).toEqual([
      14,
    ]);
  });

  it("clamps a span that runs past the chapter", () => {
    // Bad data should surface as the verses that exist, not as phantom misses.
    expect(spanVerses(span({ verseStart: 44, verseEnd: 60 }), 45)).toEqual([
      44, 45,
    ]);
  });
});

describe("assessPassageByline", () => {
  it("calls a fully explained passage covered", () => {
    const row = assessPassageByline(span(), 45, byline(1, [13, 14, 15, 16]));
    expect(row.status).toBe("covered");
    expect(row.missing).toEqual([]);
  });

  it("calls a chapter with no byline ungenerated, and every verse missing", () => {
    const row = assessPassageByline(span(), 45, null);
    expect(row.status).toBe("ungenerated");
    expect(row.missing).toEqual([14, 15]);
  });

  it("treats a blank explanation as ungenerated", () => {
    expect(assessPassageByline(span(), 45, "   \n ").status).toBe(
      "ungenerated",
    );
  });

  it("calls a chapter that skipped one of the event's verses partial", () => {
    // The gap that reads on screen exactly like an ungenerated chapter, and is
    // the reason the two statuses are kept apart.
    const row = assessPassageByline(span(), 45, byline(1, [14]));
    expect(row.status).toBe("partial");
    expect(row.missing).toEqual([15]);
  });

  it("ignores verses outside the event's own span", () => {
    const row = assessPassageByline(span(), 45, byline(1, [14, 15]));
    expect(row.status).toBe("covered");
  });

  it("counts a heading with no prose under it as missing", () => {
    const empty = `# Line-by-Line Analysis of Mark 1

## Mark 1:14

> The verse text.

## Mark 1:15

> The verse text.

### Summary

Real prose.`;
    expect(assessPassageByline(span(), 45, empty).missing).toEqual([14]);
  });
});

describe("summarizeBylineCoverage", () => {
  it("adds up passages and verses", () => {
    const rows = [
      assessPassageByline(span(), 45, byline(1, [14, 15])),
      assessPassageByline(span(), 45, byline(1, [14])),
      assessPassageByline(span(), 45, null),
    ];
    expect(summarizeBylineCoverage(rows)).toEqual({
      passages: 3,
      covered: 1,
      partial: 1,
      ungenerated: 1,
      verses: 6,
      versesMissing: 3,
    });
  });
});

describe("chaptersToFill", () => {
  it("groups the gaps by book, each chapter once, in order", () => {
    const rows = [
      assessPassageByline(span(), 45, null),
      assessPassageByline(span({ verseStart: 16, verseEnd: 20 }), 45, null),
      assessPassageByline(
        span({ bookId: 40, bookName: "Matthew", chapter: 4, verseStart: 17 }),
        25,
        null,
      ),
      // Covered passages never make it into a fill run.
      assessPassageByline(span({ chapter: 2, verseStart: 1 }), 28, null),
      assessPassageByline(span(), 45, byline(1, [14, 15])),
    ];
    expect(chaptersToFill(rows)).toEqual([
      { bookId: 40, bookName: "Matthew", chapters: [4] },
      { bookId: 41, bookName: "Mark", chapters: [1, 2] },
    ]);
  });

  it("is empty when everything is covered", () => {
    expect(
      chaptersToFill([assessPassageByline(span(), 45, byline(1, [14, 15]))]),
    ).toEqual([]);
  });
});
