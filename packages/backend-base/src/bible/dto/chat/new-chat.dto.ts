import { type Static, t } from "elysia";
import { UUIDField } from "../user/user.dto";

export const NewChatDto = t.Object({
  user_id: UUIDField,
  title: t.String({ maxLength: 250 }),
  chapter_id: t.Number({ minimum: 1 }),
  book_id: t.Number({ minimum: 1 }),
  chapter_number: t.Number({ minimum: 1 }),
});

export type NewChatDto = Static<typeof NewChatDto>;
