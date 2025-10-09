import { type Static, t } from "elysia";
import { UserDto } from "../user/user.dto";

export const MessageHistoryDto = t.Object({
  conversation_id: t.Number({
    error: "Invalid conversation id",
  }),
  session: t.Pick(UserDto, ["id"]),
});

export type MessageHistoryDto = Static<typeof MessageHistoryDto>;
