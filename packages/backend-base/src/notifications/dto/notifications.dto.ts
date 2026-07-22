import { t } from "elysia";

/** Body for PUT /notifications/device — register/refresh this device's token. */
export const RegisterDeviceDto = t.Object({
  token: t.String({ minLength: 1 }),
  platform: t.Union([t.Literal("ios"), t.Literal("android")]),
});

/** Body for DELETE /notifications/device — unregister (Settings off / logout). */
export const UnregisterDeviceDto = t.Object({
  token: t.String({ minLength: 1 }),
});

/**
 * Body for POST /admin/notifications/broadcast. `deepLink` is validated to the
 * versemate:// scheme in the service (open-redirect guard, D-14).
 */
export const BroadcastDto = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  body: t.String({ minLength: 1, maxLength: 1000 }),
  deepLink: t.Optional(t.Union([t.String(), t.Null()])),
});
