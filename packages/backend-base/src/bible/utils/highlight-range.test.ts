import { describe, expect, it } from "bun:test";

import {
  type CharRange,
  asCharRange,
  charRangesOverlap,
  normaliseCharRange,
  sameCharRange,
  unionOfCharRanges,
} from "./highlight-range";

const r = (
  start_verse: number,
  start_char: number,
  end_verse: number,
  end_char: number,
): CharRange => ({ start_verse, start_char, end_verse, end_char });

describe("normaliseCharRange", () => {
  it("keeps start_char > end_char across verses: they are offsets into different verses", () => {
    expect(normaliseCharRange(r(12, 30, 13, 5))).toEqual(r(12, 30, 13, 5));
  });

  it("swaps a backwards range within one verse", () => {
    expect(normaliseCharRange(r(14, 20, 14, 5))).toEqual(r(14, 5, 14, 20));
  });

  it("clamps negative offsets to the start of their verse", () => {
    expect(normaliseCharRange(r(3, -2, 4, -1))).toEqual(r(3, 0, 4, 0));
    expect(normaliseCharRange(r(3, 6, 3, -4))).toEqual(r(3, 0, 3, 6));
  });
});

describe("charRangesOverlap", () => {
  it("is true when the ranges share a character in one verse", () => {
    expect(charRangesOverlap(r(3, 5, 3, 15), r(3, 10, 3, 25))).toBe(true);
    expect(charRangesOverlap(r(3, 10, 3, 25), r(3, 5, 3, 15))).toBe(true);
  });

  it("is false for ranges that only touch", () => {
    expect(charRangesOverlap(r(9, 0, 9, 10), r(9, 10, 9, 20))).toBe(false);
    expect(charRangesOverlap(r(9, 10, 9, 20), r(9, 0, 9, 10))).toBe(false);
    expect(charRangesOverlap(r(10, 5, 11, 8), r(11, 8, 12, 3))).toBe(false);
  });

  it("compares across verses by verse first, then offset", () => {
    // Late in 12 → early in 13 against the middle of 12: no shared character.
    expect(charRangesOverlap(r(12, 30, 13, 5), r(12, 0, 12, 20))).toBe(false);
    // ... against the end of 12: shared.
    expect(charRangesOverlap(r(12, 30, 13, 5), r(12, 25, 12, 40))).toBe(true);
    // ... against a range in 13 starting at 5: touches only.
    expect(charRangesOverlap(r(12, 30, 13, 5), r(13, 5, 13, 9))).toBe(false);
    // A range spanning a whole verse in between overlaps anything in it.
    expect(charRangesOverlap(r(5, 15, 7, 2), r(6, 0, 6, 1))).toBe(true);
  });

  it("is true when one range contains the other", () => {
    expect(charRangesOverlap(r(2, 0, 2, 30), r(2, 5, 2, 10))).toBe(true);
    expect(charRangesOverlap(r(2, 5, 2, 10), r(2, 0, 2, 30))).toBe(true);
  });

  it("never counts an empty range as overlapping", () => {
    expect(charRangesOverlap(r(2, 5, 2, 5), r(2, 0, 2, 30))).toBe(false);
  });
});

describe("unionOfCharRanges", () => {
  it("covers every range, earliest start to latest end", () => {
    expect(
      unionOfCharRanges(r(5, 15, 6, 35), r(5, 10, 5, 20), r(6, 30, 7, 4)),
    ).toEqual(r(5, 10, 7, 4));
  });

  it("is the range itself when given one", () => {
    expect(unionOfCharRanges(r(12, 30, 13, 5))).toEqual(r(12, 30, 13, 5));
  });
});

describe("sameCharRange / asCharRange", () => {
  it("compares both ends", () => {
    expect(sameCharRange(r(1, 2, 3, 4), r(1, 2, 3, 4))).toBe(true);
    expect(sameCharRange(r(1, 2, 3, 4), r(1, 2, 3, 5))).toBe(false);
  });

  it("narrows rows with both offsets and rejects whole-verse rows", () => {
    const row = { start_verse: 1, end_verse: 1, start_char: 0, end_char: 3 };
    expect(asCharRange(row)).toBe(row as typeof row & CharRange);
    expect(
      asCharRange({
        start_verse: 1,
        end_verse: 1,
        start_char: null,
        end_char: null,
      }),
    ).toBeNull();
  });
});
