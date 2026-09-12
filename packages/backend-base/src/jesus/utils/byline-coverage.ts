/**
 * Does every verse the Jesus feature prints carry a line-by-line explanation?
 *
 * The Jesus screens do not generate their own By-Line content and do not need
 * to: the commentary already stored per Bible chapter is keyed by (book,
 * chapter, verse), and an event knows the verses it spans, so the client
 * narrows the chapter's byline to the pericope. That is only as complete as
 * the chapters behind it — an event whose chapter was never generated shows a
 * passage with no explanation, and so does one whose chapter byline skipped
 * the verses that event happens to cover.
 *
 * Those two gaps look identical on screen and are filled differently, so this
 * module keeps them apart:
 *
 *   - `ungenerated` — the chapter has no active byline explanation at all.
 *     Fill by generating that chapter.
 *   - `partial`     — the chapter has one, but some of the event's own verses
 *     have no summary under it. Fill by regenerating that chapter; the
 *     generator's own completeness guard (`findVersesMissingSummary`) is what
 *     names the verses.
 *
 * Kept free of database access so the assessment can be tested on fixtures,
 * the same split `jesus.constants.assessCoverage` uses against the facet
 * targets.
 */
import { findVersesMissingSummary } from "../../shared/byline-chunking";

/** One passage a Jesus event or entry points at. */
export interface JesusPassageSpan {
  /** Which side of the feature owns it — the event graph, or a legacy entry. */
  source: "event" | "entry";
  slug: string;
  title: string;
  bookId: number;
  bookName: string;
  chapter: number;
  /** null = the passage is the whole chapter. */
  verseStart: number | null;
  /** null with a `verseStart` = a single verse. */
  verseEnd: number | null;
}

export type BylineCoverageStatus = "covered" | "partial" | "ungenerated";

export interface PassageBylineCoverage {
  passage: JesusPassageSpan;
  /** "Mark 1:14-15" */
  display: string;
  status: BylineCoverageStatus;
  /** Every verse the passage spans. */
  verses: number[];
  /** The ones with no line-by-line summary. Empty when `covered`. */
  missing: number[];
}

/** "Mark 1:14-15", "Matthew 4:17", "Psalms 119" — how a span reads. */
export function displaySpan(span: JesusPassageSpan): string {
  if (span.verseStart == null) return `${span.bookName} ${span.chapter}`;
  if (span.verseEnd == null || span.verseEnd === span.verseStart) {
    return `${span.bookName} ${span.chapter}:${span.verseStart}`;
  }
  return `${span.bookName} ${span.chapter}:${span.verseStart}-${span.verseEnd}`;
}

/**
 * The verse numbers a span covers.
 *
 * A null `verseStart` means the whole chapter, which is why this needs the
 * chapter's verse count rather than working from the span alone. A span that
 * runs past the end of the chapter is clamped: bad data should show up as the
 * verses that exist, not as a hundred phantom misses.
 */
export function spanVerses(
  span: JesusPassageSpan,
  chapterVerseCount: number,
): number[] {
  if (chapterVerseCount <= 0) return [];
  const start = span.verseStart == null ? 1 : span.verseStart;
  const end =
    span.verseStart == null
      ? chapterVerseCount
      : span.verseEnd ?? span.verseStart;
  const from = Math.max(1, start);
  const to = Math.min(chapterVerseCount, end);
  const verses: number[] = [];
  for (let v = from; v <= to; v++) verses.push(v);
  return verses;
}

/**
 * @param byline  the chapter's active byline explanation, or null when the
 *   chapter has none
 */
export function assessPassageByline(
  span: JesusPassageSpan,
  chapterVerseCount: number,
  byline: string | null,
): PassageBylineCoverage {
  const verses = spanVerses(span, chapterVerseCount);
  const display = displaySpan(span);

  if (!byline?.trim()) {
    return {
      passage: span,
      display,
      status: "ungenerated",
      verses,
      missing: verses,
    };
  }

  if (verses.length === 0) {
    return { passage: span, display, status: "covered", verses, missing: [] };
  }

  // Same reader the generator's own completeness guard uses, so "explained"
  // here means exactly what it means at generation time.
  const missing = findVersesMissingSummary(
    byline,
    span.chapter,
    verses[0],
    verses[verses.length - 1],
  );

  return {
    passage: span,
    display,
    status: missing.length === 0 ? "covered" : "partial",
    verses,
    missing,
  };
}

export interface BylineCoverageSummary {
  passages: number;
  covered: number;
  partial: number;
  ungenerated: number;
  /** Verses across every passage, and how many of them lack an explanation. */
  verses: number;
  versesMissing: number;
}

export function summarizeBylineCoverage(
  rows: PassageBylineCoverage[],
): BylineCoverageSummary {
  return rows.reduce<BylineCoverageSummary>(
    (acc, row) => ({
      passages: acc.passages + 1,
      covered: acc.covered + (row.status === "covered" ? 1 : 0),
      partial: acc.partial + (row.status === "partial" ? 1 : 0),
      ungenerated: acc.ungenerated + (row.status === "ungenerated" ? 1 : 0),
      verses: acc.verses + row.verses.length,
      versesMissing: acc.versesMissing + row.missing.length,
    }),
    {
      passages: 0,
      covered: 0,
      partial: 0,
      ungenerated: 0,
      verses: 0,
      versesMissing: 0,
    },
  );
}

export interface BookFill {
  bookId: number;
  bookName: string;
  /** Ascending, each chapter once. */
  chapters: number[];
}

/**
 * The chapters to regenerate, grouped by book — what the admin batch operation
 * takes as its `chapters` argument.
 *
 * Both gap kinds land here: a chapter with no byline and a chapter whose byline
 * skipped verses are filled by the same batch, so the caller does not have to
 * treat them differently.
 */
export function chaptersToFill(rows: PassageBylineCoverage[]): BookFill[] {
  const byBook = new Map<number, BookFill>();
  for (const row of rows) {
    if (row.status === "covered") continue;
    const { bookId, bookName, chapter } = row.passage;
    const book = byBook.get(bookId) ?? { bookId, bookName, chapters: [] };
    if (!book.chapters.includes(chapter)) book.chapters.push(chapter);
    byBook.set(bookId, book);
  }
  return [...byBook.values()]
    .map((book) => ({ ...book, chapters: book.chapters.sort((a, b) => a - b) }))
    .sort((a, b) => a.bookId - b.bookId);
}
