import { Elysia } from "elysia";
import { adminGuard } from "../auth/admin.utils";
import { authDerive, authGuard } from "../auth/auth.utils";
import { createErrorHandler } from "../common/error-handler";
import { UnauthorizedError } from "../common/errors";
import {
  BooleanResponse,
  StandardErrorResponses,
} from "../common/response-schemas";
import { createIpRateLimit } from "../middleware/rate-limit";
import shared from "../shared/shared.plugin";
import {
  BroadcastDto,
  RegisterDeviceDto,
  UnregisterDeviceDto,
} from "./dto/notifications.dto";
import {
  BroadcastResponseSchema,
  RecipientCountResponseSchema,
} from "./schemas/notifications-response.schema";
import { NotificationsService } from "./services/notifications.service";

// Token writes are an abuse target — cap per IP like the daily-verse endpoint (D-17).
const deviceRateLimit = createIpRateLimit(60);

const plugin = new Elysia()
  .use(shared)
  .onError(createErrorHandler("notifications plugin"))
  .state((state) => ({
    ...state,
    notificationsService: new NotificationsService(state.db, {
      cache: state.cache,
    }),
  }))
  // Device registration — authenticated users only.
  .guard(authGuard, (app) =>
    app.resolve({ as: "scoped" }, authDerive).group("/notifications", (app) =>
      app
        .put(
          "/device",
          async ({ currentUserId, body, store: { notificationsService } }) => {
            if (!currentUserId) {
              throw new UnauthorizedError("Authentication required");
            }
            await notificationsService.registerDevice({
              userId: currentUserId,
              token: body.token,
              platform: body.platform,
            });
            return true;
          },
          {
            beforeHandle: deviceRateLimit,
            body: RegisterDeviceDto,
            response: { 200: BooleanResponse, ...StandardErrorResponses },
            detail: {
              tags: ["Notifications"],
              summary: "Register push device token",
              description:
                "Registers (or refreshes) this device's Expo push token for the authenticated user.",
            },
          },
        )
        .delete(
          "/device",
          async ({ currentUserId, body, store: { notificationsService } }) => {
            if (!currentUserId) {
              throw new UnauthorizedError("Authentication required");
            }
            await notificationsService.unregisterDevice({
              userId: currentUserId,
              token: body.token,
            });
            return true;
          },
          {
            beforeHandle: deviceRateLimit,
            body: UnregisterDeviceDto,
            response: { 200: BooleanResponse, ...StandardErrorResponses },
            detail: {
              tags: ["Notifications"],
              summary: "Unregister push device token",
              description:
                "Soft-deletes this device's token (Settings toggle off or logout).",
            },
          },
        ),
    ),
  )
  // Admin routes — authGuard first so token revocation (the redis access-token
  // allow-list) applies, matching admin.plugin.ts's two-guard model; then
  // adminGuard for the is_admin check.
  .guard(authGuard, (app) =>
    app.resolve({ as: "scoped" }, authDerive).guard(adminGuard, (app) =>
      app
        .get(
          "/admin/notifications/recipient-count",
          async ({ store: { notificationsService } }) => {
            const count = await notificationsService.getActiveRecipientCount();
            return { count };
          },
          {
            response: {
              200: RecipientCountResponseSchema,
              ...StandardErrorResponses,
            },
            detail: {
              tags: ["Notifications"],
              summary: "Active push recipient count",
              description:
                "Number of active device tokens a broadcast would reach (preview before sending).",
            },
          },
        )
        .post(
          "/admin/notifications/broadcast",
          async ({ currentUserId, body, store: { notificationsService } }) => {
            return notificationsService.broadcast(
              { title: body.title, body: body.body, deepLink: body.deepLink },
              currentUserId,
            );
          },
          {
            body: BroadcastDto,
            response: {
              200: BroadcastResponseSchema,
              ...StandardErrorResponses,
            },
            detail: {
              tags: ["Notifications"],
              summary: "Broadcast a notification to all users",
              description:
                "Sends an ad-hoc push to every active device. deepLink must use the versemate:// scheme. Audited in notification_broadcasts.",
            },
          },
        ),
    ),
  );

export type NotificationsPlugin = typeof plugin;

export default plugin;
