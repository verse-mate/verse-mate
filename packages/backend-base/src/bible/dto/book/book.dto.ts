import TestamentEnum from "database/src/models/public/TestamentEnum";
import { type Static, t } from "elysia";

export const BookDto = t.Object({
  book_id: t.Union([t.Number(), t.Null()]),
  name: t.Union([t.String(), t.Null()]),
  testament: t.Union([t.Enum(TestamentEnum), t.Null()]),
  genre_id: t.Union([t.Number(), t.Null()]),
  genre_name: t.Union([t.String(), t.Null()]),
});

export type BookDto = Static<typeof BookDto>;
