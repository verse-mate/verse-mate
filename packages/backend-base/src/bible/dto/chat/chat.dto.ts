import StatusEnum from "database/src/models/public/StatusEnum";
import { type Static, t } from "elysia";
import { BookDto } from "../book/book.dto";
import { UUIDField } from "../user/user.dto";
import { MessageDto } from "./message.dto";

export const ChatEntity = t.Object({
  conversation_id: t.Number(),
  user_id: UUIDField,
  title: t.String({ maxLength: 250 }),
  status: t.Enum(StatusEnum),
  updated_at: t.String(), // ISO date string (serialized from Date for API response)
  book: t.Omit(BookDto, ["genre_name"]),
  chapter_number: t.Nullable(t.Number()),
  messages: t.Array(MessageDto),
});

export type ChatEntity = Static<typeof ChatEntity>;
