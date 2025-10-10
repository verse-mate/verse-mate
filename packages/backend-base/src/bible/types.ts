/**
 * Bible data parsing types
 *
 * These types are used exclusively for parsing Bible JSON files during
 * data seeding and pre-generation scripts. They match the source JSON format
 * with abbreviated field names (b, c, n, g, t).
 *
 * ⚠️ DO NOT USE these types for API responses or service layer.
 * For API responses, use types from `../shared/schemas/common-types.schema.ts` instead.
 *
 * Usage:
 * - bible.ts - JSON data parser
 * - seed.ts - Database seeding
 * - pregenerate-*.ts - Pre-generation scripts
 * - check-bible-data-*.ts - Data validation
 */

export type Genre = {
  g: number;
  n: string;
};

export type Testament = "OT" | "NT";

export type Verse = {
  verseId: number;
  text: string;
};

export type Subtitle = {
  subtitle: string;
  start_verse: number;
  end_verse: number;
};

export type Chapter = {
  chapterId: number;
  subtitles: Subtitle[];
  verses: Verse[];
};

export type Book = {
  bookId: number;
  name: string;
  testament: Testament;
  genre: Genre;
  chapters: Chapter[];
};

export type Bible = { books: Book[] };

export type BookMeta = {
  bookId: number;
  name: string;
  testament: Testament;
  genre: Genre;
  chaptersCount: number;
};
