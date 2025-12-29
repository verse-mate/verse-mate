import { type Static, t } from "elysia";

export const CreateSupportConversationDto = t.Object({
  text: t.String(),
  subject: t.Optional(t.String()),
});

export type CreateSupportConversationDto = Static<
  typeof CreateSupportConversationDto
>;

export const CreateSupportMessageDto = t.Object({
  text: t.String(),
});

export type CreateSupportMessageDto = Static<typeof CreateSupportMessageDto>;
