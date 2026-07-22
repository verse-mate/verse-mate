import {
  Expo,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from "expo-server-sdk";

/**
 * A single push to one Expo push token. `data` is the arbitrary JSON payload
 * delivered to the client (we put the deep link + type there).
 */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Per-token send outcome. `error === "DeviceNotRegistered"` is the one the
 * caller acts on — it means the token is dead and should be soft-deleted.
 * Other errors are logged but the token is kept (transient).
 */
export interface PushSendResult {
  token: string;
  ok: boolean;
  error?: string;
}

/**
 * The seam the notifications service depends on. Kept as a plain interface so
 * the service (and its unit tests) never import `expo-server-sdk` — tests pass
 * a fake, the worker passes {@link ExpoPushClient}.
 */
export interface PushClient {
  send(messages: PushMessage[]): Promise<PushSendResult[]>;
}

/** The subset of the Expo SDK the client drives — injectable for tests. */
export interface ExpoLike {
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
  sendPushNotificationsAsync(
    messages: ExpoPushMessage[],
  ): Promise<ExpoPushTicket[]>;
}

/**
 * Expo Push Service implementation. Validates tokens, chunks per Expo's limit,
 * and maps tickets back to per-token results. Receipt reconciliation is out of
 * scope for v1 (D-6): a `DeviceNotRegistered` ticket is enough to prune dead
 * tokens; lingering dead tokens only waste a silent send.
 */
export class ExpoPushClient implements PushClient {
  private readonly expo: ExpoLike;

  constructor(
    accessToken: string | undefined = process.env.EXPO_ACCESS_TOKEN,
    expo?: ExpoLike,
  ) {
    this.expo = expo ?? (accessToken ? new Expo({ accessToken }) : new Expo());
  }

  async send(messages: PushMessage[]): Promise<PushSendResult[]> {
    const results: PushSendResult[] = [];
    const valid: PushMessage[] = [];

    for (const message of messages) {
      if (Expo.isExpoPushToken(message.to)) {
        valid.push(message);
      } else {
        results.push({ token: message.to, ok: false, error: "InvalidToken" });
      }
    }

    const expoMessages: ExpoPushMessage[] = valid.map((message) => ({
      to: message.to,
      title: message.title,
      body: message.body,
      data: message.data,
      sound: "default",
    }));

    const chunks = this.expo.chunkPushNotifications(expoMessages);
    let offset = 0;

    for (const chunk of chunks) {
      let tickets: ExpoPushTicket[];
      try {
        tickets = await this.expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        // Whole-chunk transport failure — mark every token in it failed
        // (no prune; it's transient) and keep going with the next chunk.
        for (let i = 0; i < chunk.length; i++) {
          results.push({
            token: valid[offset + i].to,
            ok: false,
            error: error instanceof Error ? error.message : "SendError",
          });
        }
        offset += chunk.length;
        continue;
      }

      tickets.forEach((ticket, i) => {
        const token = valid[offset + i].to;
        if (ticket.status === "ok") {
          results.push({ token, ok: true });
        } else {
          results.push({
            token,
            ok: false,
            error: ticket.details?.error ?? "TicketError",
          });
        }
      });
      offset += chunk.length;
    }

    return results;
  }
}
