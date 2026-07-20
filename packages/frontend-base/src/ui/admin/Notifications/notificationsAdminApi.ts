import { api } from "backend-api";

// Eden Treaty: admin routes are loosely typed (`as any`) to match the existing
// admin API pattern (see dailyVersesAdminApi) and avoid coupling to the exact
// generated App type. Route: /admin/notifications/*.
const notificationsApi = () => (api.admin as any).notifications;

export interface BroadcastInput {
  title: string;
  body: string;
  deepLink?: string | null;
}

export interface BroadcastResult {
  recipientCount: number;
  pruned: number;
}

/** Active device count a broadcast would reach (preview before sending). */
export const getRecipientCount = async (): Promise<number> => {
  const response = await notificationsApi()["recipient-count"].get();
  return response.data?.count ?? 0;
};

/** Send a broadcast to all active devices. Throws on validation/other errors. */
export const sendBroadcast = async (
  input: BroadcastInput,
): Promise<BroadcastResult> => {
  const response = await notificationsApi().broadcast.post({
    title: input.title,
    body: input.body,
    deepLink: input.deepLink?.trim() ? input.deepLink.trim() : undefined,
  });
  if (response.error) {
    const message =
      (response.error.value as { message?: string } | undefined)?.message ??
      `Broadcast failed (${response.status})`;
    throw new Error(message);
  }
  return response.data as BroadcastResult;
};
