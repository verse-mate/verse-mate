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

export const DailyVerseTagSchema = t.Object({
  id: t.String({ format: "uuid" }),
  slug: t.String(),
  label: t.String(),
  is_active: t.Boolean(),
  created_at: t.Union([t.Date(), t.Null()]),
  updated_at: t.Union([t.Date(), t.Null()]),
});

export const AdminDailyVerseSchema = t.Object({
  id: t.String({ format: "uuid" }),
  book_id: t.Number(),
  chapter_number: t.Number(),
  verse_start: t.Number(),
  verse_end: t.Union([t.Number(), t.Null()]),
  note: t.Union([t.String(), t.Null()]),
  is_active: t.Boolean(),
  created_at: t.Union([t.Date(), t.Null()]),
  updated_at: t.Union([t.Date(), t.Null()]),
  tags: t.Array(
    t.Object({
      id: t.String({ format: "uuid" }),
      slug: t.String(),
      label: t.String(),
    }),
  ),
});

export const AdminDailyVerseListSchema = t.Object({
  items: t.Array(AdminDailyVerseSchema),
  total: t.Number(),
});

export const AdminDailyVerseHistorySchema = t.Object({
  history: t.Array(
    t.Object({
      id: t.String({ format: "uuid" }),
      pick_date: t.Union([t.Date(), t.String()]),
      daily_verse_id: t.String({ format: "uuid" }),
      user_id: t.Union([t.String(), t.Null()]),
      book_id: t.Number(),
      chapter_number: t.Number(),
      verse_start: t.Number(),
      verse_end: t.Union([t.Number(), t.Null()]),
    }),
  ),
});
