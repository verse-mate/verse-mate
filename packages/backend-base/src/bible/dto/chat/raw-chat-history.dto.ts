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
  updated_at: t.Union([t.Date(), t.Null()]),
  message_id: t.Union([t.Number(), t.Null()]),
  content: t.Union([t.String(), t.Null()]),
  role: t.Union([t.Enum(RoleEnum), t.Null()]),
  chapter_number: t.Union([t.Number(), t.Null()]),
  book_id: t.Union([t.Number(), t.Null()]),
  bookName: t.Union([t.String(), t.Null()]),
  bookTestament: t.Union([t.Enum(TestamentEnum), t.Null()]),
  genreId: t.Union([t.Number(), t.Null()]),
});

export type RawChatHistoryDto = Static<typeof RawChatHistoryDto>;
