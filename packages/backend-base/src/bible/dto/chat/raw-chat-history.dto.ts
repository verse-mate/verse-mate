import RoleEnum from "database/src/models/public/RoleEnum";
import StatusEnum from "database/src/models/public/StatusEnum";
import TestamentEnum from "database/src/models/public/TestamentEnum";
import { type Static, t } from "elysia";
import { UUIDField } from "../user/user.dto";

export const RawChatHistoryDto = t.Object({
  conversation_id: t.Number(),
  user_id: UUIDField,
  title: t.String({ maxLength: 250 }),
  status: t.Enum(StatusEnum),
  updated_at: t.Optional(t.Date()),
  message_id: t.Optional(t.Number()),
  content: t.Optional(t.String()),
  role: t.Optional(t.Enum(RoleEnum)),
  chapter_number: t.Optional(t.Number()),
  book_id: t.Optional(t.Number()),
  bookName: t.Optional(t.String()),
  bookTestament: t.Optional(t.Enum(TestamentEnum)),
  genreId: t.Optional(t.Number()),
});

export type RawChatHistoryDto = Static<typeof RawChatHistoryDto>;
