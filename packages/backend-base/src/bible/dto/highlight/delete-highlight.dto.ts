import { type Static, t } from "elysia";

export const DeleteHighlightDto = t.Object({
  highlight_id: t.Number(),
  user_id: t.String(),
});

export type DeleteHighlightDto = Static<typeof DeleteHighlightDto>;
