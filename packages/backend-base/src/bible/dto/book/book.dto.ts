import TestamentEnum from "database/src/models/public/TestamentEnum";
import { type Static, t } from "elysia";

export const BookDto = t.Object({
  book_id: t.Optional(t.Number()),
  name: t.Optional(t.String()),
  testament: t.Optional(t.Enum(TestamentEnum)),
  genre_id: t.Optional(t.Number()),
  genre_name: t.Optional(t.String()),
});

export type BookDto = Static<typeof BookDto>;
