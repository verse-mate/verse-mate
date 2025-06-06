import { type Static, t } from "elysia";

export const ChapterDto = t.Object({
  book_id: t.Number(),
  chapter_id: t.Number(),
  chapter_number: t.Number(),
});

export type ChapterDto = Static<typeof ChapterDto>;
