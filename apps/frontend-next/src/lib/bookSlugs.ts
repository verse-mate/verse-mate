/**
 * Book slug utilities for server-side use
 * These are duplicated here to avoid the "use client" boundary issue
 */

export const BOOK_SLUGS: Record<number, string> = {
  // Old Testament
  1: "genesis",
  2: "exodus",
  3: "leviticus",
  4: "numbers",
  5: "deuteronomy",
  6: "joshua",
  7: "judges",
  8: "ruth",
  9: "1-samuel",
  10: "2-samuel",
  11: "1-kings",
  12: "2-kings",
  13: "1-chronicles",
  14: "2-chronicles",
  15: "ezra",
  16: "nehemiah",
  17: "esther",
  18: "job",
  19: "psalms",
  20: "proverbs",
  21: "ecclesiastes",
  22: "song-of-solomon",
  23: "isaiah",
  24: "jeremiah",
  25: "lamentations",
  26: "ezekiel",
  27: "daniel",
  28: "hosea",
  29: "joel",
  30: "amos",
  31: "obadiah",
  32: "jonah",
  33: "micah",
  34: "nahum",
  35: "habakkuk",
  36: "zephaniah",
  37: "haggai",
  38: "zechariah",
  39: "malachi",
  // New Testament
  40: "matthew",
  41: "mark",
  42: "luke",
  43: "john",
  44: "acts",
  45: "romans",
  46: "1-corinthians",
  47: "2-corinthians",
  48: "galatians",
  49: "ephesians",
  50: "philippians",
  51: "colossians",
  52: "1-thessalonians",
  53: "2-thessalonians",
  54: "1-timothy",
  55: "2-timothy",
  56: "titus",
  57: "philemon",
  58: "hebrews",
  59: "james",
  60: "1-peter",
  61: "2-peter",
  62: "1-john",
  63: "2-john",
  64: "3-john",
  65: "jude",
  66: "revelation",
};

const SLUG_TO_BOOK_ID: Record<string, number> = Object.entries(
  BOOK_SLUGS,
).reduce(
  (acc, [id, slug]) => {
    acc[slug] = Number(id);
    return acc;
  },
  {} as Record<string, number>,
);

export function getBookSlug(bookId: number): string | null {
  return BOOK_SLUGS[bookId] ?? null;
}

export function getBookIdFromSlug(slug: string): number | null {
  return SLUG_TO_BOOK_ID[slug.toLowerCase()] ?? null;
}

export function parseBookParam(param: string): number | null {
  const numericId = Number.parseInt(param, 10);
  if (!Number.isNaN(numericId) && numericId >= 1 && numericId <= 66) {
    return numericId;
  }
  return getBookIdFromSlug(param);
}
