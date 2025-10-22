import { type Static, t } from "elysia";
import { ChatEntity } from "./chat.dto";

export const GroupedChatHistoryDto = t.Object({
  today: t.Array(ChatEntity),
  yesterday: t.Array(ChatEntity),
  lastSevenDays: t.Array(ChatEntity),
  older: t.Array(ChatEntity),
});

export type GroupedChatHistoryDto = Static<typeof GroupedChatHistoryDto>;
