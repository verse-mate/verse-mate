import HighlightColorEnum from "database/src/models/public/HighlightColorEnum";
import { type Static, t } from "elysia";

export const UpdateHighlightDto = t.Object({
  highlight_id: t.Number(),
  user_id: t.String(),
  color: t.Enum(HighlightColorEnum),
});

export type UpdateHighlightDto = Static<typeof UpdateHighlightDto>;
