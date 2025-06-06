import { type Static, t } from "elysia";
import { ChatDto } from "./chat.dto";

export const GroupedChatHistoryDto = t.Record(t.String(), t.Array(ChatDto));

export type GroupedChatHistoryDto = Static<typeof GroupedChatHistoryDto>;
