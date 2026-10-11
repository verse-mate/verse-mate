import { type Static, t } from "elysia";

export const SUPPORT_MESSAGE_MAX_LENGTH = 20_000;
export const SUPPORT_SUBJECT_MAX_LENGTH = 255;

export const CreateSupportConversationDto = t.Object({
  text: t.String({ maxLength: SUPPORT_MESSAGE_MAX_LENGTH }),
  subject: t.Optional(t.String({ maxLength: SUPPORT_SUBJECT_MAX_LENGTH })),
});

export type CreateSupportConversationDto = Static<
  typeof CreateSupportConversationDto
>;

export const CreateSupportMessageDto = t.Object({
  text: t.String({ maxLength: SUPPORT_MESSAGE_MAX_LENGTH }),
});

export type CreateSupportMessageDto = Static<typeof CreateSupportMessageDto>;
