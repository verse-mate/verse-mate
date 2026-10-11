import { Elysia, t } from "elysia";
import { authDerive } from "../auth/auth.utils";
import { UnauthorizedError } from "../common/errors";
import { StandardErrorResponses } from "../common/response-schemas";
import shared from "../shared/shared.plugin";
import {
  CreateSupportConversationDto,
  CreateSupportMessageDto,
} from "./dto/support.dto";
import { SupportService } from "./services/support.service";

const SupportConversationSchema = t.Object({
  id: t.String({ format: "uuid" }),
  user_id: t.String({ format: "uuid" }),
  subject: t.Union([t.String(), t.Null()]),
  status: t.String(),
  last_message_at: t.Union([t.String(), t.Null()]),
  created_at: t.Union([t.String(), t.Null()]),
});

const SupportMessageSchema = t.Object({
  id: t.String({ format: "uuid" }),
  conversation_id: t.String({ format: "uuid" }),
  user_id: t.String({ format: "uuid" }),
  text: t.String(),
  sender: t.Union([t.Literal("user"), t.Literal("support")]),
  created_at: t.Union([t.String(), t.Null()]), // ISO Date string
});

const SupportConversationsResponseSchema = t.Object({
  conversations: t.Array(SupportConversationSchema),
});

const SupportMessagesResponseSchema = t.Object({
  messages: t.Array(SupportMessageSchema),
});

const plugin = new Elysia()
  .use(shared)
  .state((state) => {
    return {
      ...state,
      supportService: new SupportService(state.db),
    };
  })
  .group("/support", (app) =>
    app
      .resolve({ as: "scoped" }, authDerive)
      .get(
        "/conversations",
        async ({ store: { supportService }, currentUserId }) => {
          if (!currentUserId) {
            throw new UnauthorizedError("Authentication required");
          }
          const conversations =
            await supportService.getConversations(currentUserId);

          // Serialize dates for conversations
          const serializedConversations = conversations.map((c) => ({
            ...c,
            last_message_at:
              c.last_message_at instanceof Date
                ? c.last_message_at.toISOString()
                : c.last_message_at,
            created_at:
              c.created_at instanceof Date
                ? c.created_at.toISOString()
                : c.created_at,
          }));

          return { conversations: serializedConversations };
        },
        {
          response: {
            200: SupportConversationsResponseSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/conversations",
        async ({ body, store: { supportService }, currentUserId }) => {
          if (!currentUserId) {
            throw new UnauthorizedError("Authentication required");
          }
          return await supportService.handleNewConversation(
            currentUserId,
            body.text,
            body.subject,
          );
        },
        {
          body: CreateSupportConversationDto,
          response: {
            200: t.Object({ success: t.Boolean(), conversationId: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/conversations/:id/messages",
        async ({ params, store: { supportService }, currentUserId }) => {
          if (!currentUserId) {
            throw new UnauthorizedError("Authentication required");
          }
          const messages = await supportService.getMessages(
            params.id,
            currentUserId,
          );
          return { messages };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          response: {
            200: SupportMessagesResponseSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/conversations/:id/messages",
        async ({ params, body, store: { supportService }, currentUserId }) => {
          if (!currentUserId) {
            throw new UnauthorizedError("Authentication required");
          }
          return await supportService.handleUserMessage(
            currentUserId,
            params.id,
            body.text,
          );
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: CreateSupportMessageDto,
          response: {
            200: t.Object({ success: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      ),
  )
  .group("/webhooks", (app) =>
    app.post(
      "/slack",
      async ({ body, headers, store: { supportService }, set }) => {
        const bodyRaw = String(body);
        const signature = headers["x-slack-signature"];
        const timestamp = headers["x-slack-request-timestamp"];

        if (
          !signature ||
          !timestamp ||
          !supportService.verifySlackSignature(signature, timestamp, bodyRaw)
        ) {
          console.warn(
            `Refused a Slack webhook request (retry ${Number(headers["x-slack-retry-num"]) || 0}): missing, stale or invalid signature`,
          );
          set.status = 401;
          return "Invalid signature";
        }

        const payload = JSON.parse(bodyRaw);

        if (payload.type === "url_verification") {
          return { challenge: payload.challenge };
        }

        if (payload.type === "event_callback") {
          await supportService.handleSlackReply(payload.event);
        }

        return { success: true };
      },
      { parse: ({ request }) => request.text() },
    ),
  );

export type SupportPlugin = typeof plugin;

export default plugin;
