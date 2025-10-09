import { type Static, t } from "elysia";
import { ChatEntity } from "./chat.dto";

export const GroupedChatHistoryDto = t.Record(t.String(), t.Array(ChatEntity));

export type GroupedChatHistoryDto = Static<typeof GroupedChatHistoryDto>;
