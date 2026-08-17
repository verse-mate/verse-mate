/**
 * Scripture reference helpers for the Jesus feature.
 *
 * References are stored structurally (book_id, chapter, verse_start,
 * verse_end) rather than as strings. Clients need both: the structured form to
 * deep-link into the reader, and a human display string for the reference pill.
 * `formatReference` is the single place that turns one into the other so web
 * and mobile can never drift on punctuation.
 */

export interface StructuredReference {
  book_id: number;
  book_name: string;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
}

/**
 * Render a structured reference the way the rest of VerseMate writes them.
 *
 * @example
 * formatReference({ book_name: "John", chapter: 8, verse_start: 12, verse_end: 12 })   // "John 8:12"
 * formatReference({ book_name: "Mark", chapter: 4, verse_start: 35, verse_end: 41 })   // "Mark 4:35-41"
 * formatReference({ book_name: "Matthew", chapter: 24, verse_start: null, ... })       // "Matthew 24"
 */
export function formatReference(ref: {
  book_name: string;
  chapter: number;
  verse_start?: number | null;
  verse_end?: number | null;
}): string {
  const base = `${ref.book_name} ${ref.chapter}`;
  if (ref.verse_start == null) return base;
  if (ref.verse_end == null || ref.verse_end === ref.verse_start) {
    return `${base}:${ref.verse_start}`;
  }
  return `${base}:${ref.verse_start}-${ref.verse_end}`;
}

/**
 * Collapse an entry's references into the compact byline shown on a card,
 * e.g. "Matthew 8:23-27 · Mark 4:35-41 · Luke 8:22-25".
 */
export function formatReferenceList(
  refs: Array<{
    book_name: string;
    chapter: number;
    verse_start?: number | null;
    verse_end?: number | null;
  }>,
  separator = " · ",
): string {
  return refs.map((r) => formatReference(r)).join(separator);
}

/**
 * Parse the reference strings used in seed data and admin input.
 *
 * Accepts "John 8:12", "Mark 4:35-41", "Matthew 24", "1 Corinthians 15:3-8".
 * Returns null when the string doesn't look like a reference at all, so
 * callers can surface a seed/import error rather than silently dropping it.
 */
export function parseReference(input: string): {
  book: string;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
} | null {
  const match = input
    .trim()
    // Book names may lead with a numeral ("1 Corinthians", "2 John") and may
    // contain spaces ("Song of Solomon"), so the book group is greedy up to
    // the final number group.
    .match(
      /^((?:[1-3]\s+)?[A-Za-z][A-Za-z\s.]*?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/,
    );

  if (!match) return null;

  const [, book, chapter, verseStart, verseEnd] = match;
  return {
    book: book.trim(),
    chapter: Number.parseInt(chapter, 10),
    verse_start: verseStart ? Number.parseInt(verseStart, 10) : null,
    verse_end: verseEnd
      ? Number.parseInt(verseEnd, 10)
      : verseStart
        ? Number.parseInt(verseStart, 10)
        : null,
  };
}

/**
 * Slugify a title into the URL segment used at /jesus/entry/<slug>.
 * Deliberately identical to the topics slug algorithm so the two features
 * produce the same slug for the same title.
 */
export function generateEntrySlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Append `-2`, `-3`, … until the slug is free. */
export function generateUniqueEntrySlug(
  baseSlug: string,
  existingSlugs: Iterable<string>,
): string {
  const taken = new Set(existingSlugs);
  if (!taken.has(baseSlug)) return baseSlug;

  let counter = 2;
  while (taken.has(`${baseSlug}-${counter}`)) counter++;
  return `${baseSlug}-${counter}`;
}
