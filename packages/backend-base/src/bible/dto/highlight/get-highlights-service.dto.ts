import { type Static, t } from "elysia";

export const GetHighlightsServiceDto = t.Object({
  user_id: t.String(),
  chapter_id: t.Optional(t.Number()),
});

export type GetHighlightsServiceDto = Static<typeof GetHighlightsServiceDto>;
