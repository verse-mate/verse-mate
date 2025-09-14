import { type Static, t } from "elysia";

export const GetChapterHighlightsServiceDto = t.Object({
  user_id: t.String(),
  book_id: t.Number(),
  chapter_number: t.Number(),
});

export type GetChapterHighlightsServiceDto = Static<
  typeof GetChapterHighlightsServiceDto
>;
