import RoleEnum from "database/src/models/public/RoleEnum";
import StatusEnum from "database/src/models/public/StatusEnum";
import TestamentEnum from "database/src/models/public/TestamentEnum";
import { type Static, t } from "elysia";
import { UUIDField } from "../user/user.dto";

export const RawChatHistoryEntity = t.Object({
  conversation_id: t.Number(),
  user_id: UUIDField,
  title: t.String({ maxLength: 250 }),
  status: t.Enum(StatusEnum),
  updated_at: t.Nullable(t.Date()),
  message_id: t.Nullable(t.Number()),
  content: t.Nullable(t.String()),
  role: t.Nullable(t.Enum(RoleEnum)),
  created_at: t.Nullable(t.Date()),
  chapter_number: t.Nullable(t.Number()),
  book_id: t.Nullable(t.Number()),
  bookName: t.Nullable(t.String()),
  bookTestament: t.Nullable(t.Enum(TestamentEnum)),
  genreId: t.Nullable(t.Number()),
});

export type RawChatHistoryEntity = Static<typeof RawChatHistoryEntity>;
