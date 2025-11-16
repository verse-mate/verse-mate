import HighlightColorEnum from "database/src/models/public/HighlightColorEnum";
import { type Static, t } from "elysia";

export const CreateHighlightDto = t.Object({
  user_id: t.String(),
  chapter_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  start_verse: t.Number(),
  end_verse: t.Number(),
  color: t.Optional(t.Enum(HighlightColorEnum)),
  start_char: t.Optional(t.Number()),
  end_char: t.Optional(t.Number()),
  selected_text: t.Optional(t.String()),
});

export type CreateHighlightDto = Static<typeof CreateHighlightDto>;
