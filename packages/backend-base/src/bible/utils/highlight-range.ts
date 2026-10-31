/**
 * Character-precise highlight ranges.
 *
 * A char-precise highlight runs from (start_verse, start_char) to
 * (end_verse, end_char): start_char is a UTF-16 offset into start_verse's
 * text (inclusive) and end_char an offset into end_verse's text (exclusive).
 * Positions order by verse first, then by offset, so a highlight across
 * verses may well have start_char > end_char (late in verse 12 → early in
 * verse 13). Both offsets NULL means whole verses; those are not CharRanges.
 */
export type CharRange = {
  start_verse: number;
  start_char: number;
  end_verse: number;
  end_char: number;
};

type Position = { verse: number; char: number };

const startOf = (r: CharRange): Position => ({
  verse: r.start_verse,
  char: r.start_char,
});
const endOf = (r: CharRange): Position => ({
  verse: r.end_verse,
  char: r.end_char,
});

function compare(a: Position, b: Position): number {
  return a.verse - b.verse || a.char - b.char;
}

const later = (a: Position, b: Position) => (compare(a, b) >= 0 ? a : b);
const earlier = (a: Position, b: Position) => (compare(a, b) <= 0 ? a : b);

/**
 * Orders a request's offsets. Only within one verse can a range run
 * backwards: the client sent its selection anchors the wrong way round, and
 * swapping them is the selection it meant. Across verses the two offsets
 * belong to different verses and are never compared. Negative offsets are
 * clamped to the start of their verse.
 */
export function normaliseCharRange(range: CharRange): CharRange {
  let { start_char, end_char } = range;
  if (range.start_verse === range.end_verse && start_char > end_char) {
    [start_char, end_char] = [end_char, start_char];
  }
  return {
    start_verse: range.start_verse,
    start_char: Math.max(0, start_char),
    end_verse: range.end_verse,
    end_char: Math.max(0, end_char),
  };
}

/**
 * True when the two ranges share at least one character. Ranges that only
 * touch (one ends exactly where the other starts) do not overlap.
 */
export function charRangesOverlap(a: CharRange, b: CharRange): boolean {
  return (
    compare(later(startOf(a), startOf(b)), earlier(endOf(a), endOf(b))) < 0
  );
}

/** The smallest range covering every given range. */
export function unionOfCharRanges(
  first: CharRange,
  ...rest: CharRange[]
): CharRange {
  let start = startOf(first);
  let end = endOf(first);
  for (const range of rest) {
    start = earlier(start, startOf(range));
    end = later(end, endOf(range));
  }
  return {
    start_verse: start.verse,
    start_char: start.char,
    end_verse: end.verse,
    end_char: end.char,
  };
}

export function sameCharRange(a: CharRange, b: CharRange): boolean {
  return (
    compare(startOf(a), startOf(b)) === 0 && compare(endOf(a), endOf(b)) === 0
  );
}

/** Narrows a stored highlight to a CharRange when both offsets are set. */
export function asCharRange<
  T extends {
    start_verse: number;
    end_verse: number;
    start_char: number | null;
    end_char: number | null;
  },
>(row: T): (T & CharRange) | null {
  return row.start_char !== null && row.end_char !== null
    ? (row as T & CharRange)
    : null;
}
