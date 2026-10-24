import { t } from "elysia";
import { MAX_QUERY_LENGTH } from "./search-query";

export const BibleSearchQuerySchema = t.Object({
  q: t.String({ maxLength: MAX_QUERY_LENGTH }),
  /** Version key, e.g. NASB1995 (default). Same name as the chapter route. */
  bible_version: t.Optional(t.String({ maxLength: 20 })),
  testament: t.Optional(t.Union([t.Literal("OT"), t.Literal("NT")])),
  book: t.Optional(t.Numeric({ minimum: 1, maximum: 66 })),
  cursor: t.Optional(t.String({ maxLength: 10 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
});

export const BibleSearchResponseSchema = t.Object({
  results: t.Array(
    t.Object({
      match: t.Union([t.Literal("exact"), t.Literal("words")]),
      bookId: t.Number(),
      bookName: t.String(),
      chapter: t.Number(),
      verse: t.Number(),
      text: t.String(),
      highlights: t.Array(t.Tuple([t.Number(), t.Number()])),
    }),
  ),
  nextCursor: t.Nullable(t.String()),
  totals: t.Nullable(t.Object({ exact: t.Number(), words: t.Number() })),
  books: t.Nullable(
    t.Array(
      t.Object({
        bookId: t.Number(),
        name: t.String(),
        testament: t.Union([t.Literal("OT"), t.Literal("NT")]),
        count: t.Number(),
      }),
    ),
  ),
});
