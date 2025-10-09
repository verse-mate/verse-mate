import TestamentEnum from "database/src/models/public/TestamentEnum";
import { type Static, t } from "elysia";

export const BookDto = t.Object({
  book_id: t.Nullable(t.Number()),
  name: t.Nullable(t.String()),
  testament: t.Nullable(t.Enum(TestamentEnum)),
  genre_id: t.Nullable(t.Number()),
  genre_name: t.Nullable(t.String()),
});

export type BookDto = Static<typeof BookDto>;
