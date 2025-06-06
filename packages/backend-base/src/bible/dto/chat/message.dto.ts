import RoleEnum from "database/src/models/public/RoleEnum";
import { type Static, t } from "elysia";

export const MessageDto = t.Object({
  message_id: t.Number(),
  content: t.String(),
  role: t.Enum(RoleEnum),
});

export type MessageDto = Static<typeof MessageDto>;
