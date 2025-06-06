import RoleEnum from "database/src/models/public/RoleEnum";
import { type Static, t } from "elysia";

export const AddMessageDto = t.Object({
  chat_id: t.Number(),
  content: t.String(),
  role: t.Enum(RoleEnum),
});

export type AddMessageDto = Static<typeof AddMessageDto>;
