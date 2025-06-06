import { type Static, t } from "elysia";
import { UserDto } from "../user/user.dto";

export const ChatHistoryDto = t.Object({
  session: t.Pick(UserDto, ["id"]),
});

export type ChatHistoryDto = Static<typeof ChatHistoryDto>;
