import { t } from "elysia";

/** Single rendered verse line. */
export const RenderedVerseSchema = t.Object({
  verseNumber: t.Number(),
  text: t.String(),
});

/** Happy-path verse-of-the-day payload. */
export const VerseOfTheDaySchema = t.Object({
  empty: t.Literal(false),
  reference: t.Object({
    bookId: t.Number(),
    chapterNumber: t.Number(),
    verseStart: t.Number(),
    verseEnd: t.Union([t.Number(), t.Null()]),
  }),
  referenceText: t.String(),
  verses: t.Array(RenderedVerseSchema),
  tags: t.Array(t.String()),
  versionKey: t.String(),
  languageCode: t.String(),
  date: t.String(),
});

/** Empty-pool / cold-start payload (D-25). */
export const EmptyVerseOfTheDaySchema = t.Object({
  empty: t.Literal(true),
  date: t.String(),
  fallbackMessage: t.String(),
});

export const VerseOfTheDayResponseSchema = t.Union([
  VerseOfTheDaySchema,
  EmptyVerseOfTheDaySchema,
]);

/* ------------------------------- Admin -------------------------------- */

// Date fields are serialized to ISO strings before being returned (D / global
// date-serialization standard), so they are declared as t.String() here.

const DailyVerseTagRefSchema = t.Object({
  id: t.String({ format: "uuid" }),
  slug: t.String(),
  label: t.String(),
});

/** A curated verse row as returned by create/update (no joined tags). */
export const AdminDailyVerseSchema = t.Object({
  id: t.String({ format: "uuid" }),
  book_id: t.Number(),
  chapter_number: t.Number(),
  verse_start: t.Number(),
  verse_end: t.Union([t.Number(), t.Null()]),
  note: t.Union([t.String(), t.Null()]),
  is_active: t.Boolean(),
  created_at: t.Union([t.String(), t.Null()]),
  updated_at: t.Union([t.String(), t.Null()]),
});

/** A curated verse row with its joined tag set (list endpoint). */
export const AdminDailyVerseListItemSchema = t.Object({
  id: t.String({ format: "uuid" }),
  book_id: t.Number(),
  chapter_number: t.Number(),
  verse_start: t.Number(),
  verse_end: t.Union([t.Number(), t.Null()]),
  note: t.Union([t.String(), t.Null()]),
  is_active: t.Boolean(),
  created_at: t.Union([t.String(), t.Null()]),
  updated_at: t.Union([t.String(), t.Null()]),
  tags: t.Array(DailyVerseTagRefSchema),
});

export const AdminDailyVerseListSchema = t.Object({
  items: t.Array(AdminDailyVerseListItemSchema),
  total: t.Number(),
});

/** create/update return `{ verse }`. */
export const AdminDailyVerseEnvelopeSchema = t.Object({
  verse: AdminDailyVerseSchema,
});

export const DailyVerseTagSchema = t.Object({
  id: t.String({ format: "uuid" }),
  slug: t.String(),
  label: t.String(),
  is_active: t.Boolean(),
  created_at: t.Union([t.String(), t.Null()]),
  updated_at: t.Union([t.String(), t.Null()]),
});

export const AdminDailyVerseTagListSchema = t.Object({
  tags: t.Array(DailyVerseTagSchema),
});

export const AdminDailyVerseTagEnvelopeSchema = t.Object({
  tag: DailyVerseTagSchema,
});

export const AdminDeleteResultSchema = t.Object({
  success: t.Boolean(),
});

export const AdminDailyVerseHistorySchema = t.Object({
  history: t.Array(
    t.Object({
      id: t.String({ format: "uuid" }),
      pick_date: t.String(),
      daily_verse_id: t.String({ format: "uuid" }),
      user_id: t.Union([t.String(), t.Null()]),
      book_id: t.Number(),
      chapter_number: t.Number(),
      verse_start: t.Number(),
      verse_end: t.Union([t.Number(), t.Null()]),
    }),
  ),
});
