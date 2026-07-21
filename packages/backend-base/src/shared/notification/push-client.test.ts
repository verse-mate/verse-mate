/**
 * GH-281 — ExpoPushClient ticket-mapping unit tests (T-603). Injects a fake
 * Expo (no network); uses real-format Expo tokens so the real
 * `Expo.isExpoPushToken` static still gates them.
 */
import { describe, expect, it } from "bun:test";
import type { ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { type ExpoLike, ExpoPushClient, type PushMessage } from "./push-client";

const TOK_A = "ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]";
const TOK_B = "ExponentPushToken[BBBBBBBBBBBBBBBBBBBBBB]";
const TOK_C = "ExponentPushToken[CCCCCCCCCCCCCCCCCCCCCC]";

class FakeExpo implements ExpoLike {
  chunkSize = 100;
  sentChunks: ExpoPushMessage[][] = [];
  ticketFor: (to: string) => ExpoPushTicket = () =>
    ({ status: "ok", id: "receipt" }) as ExpoPushTicket;
  throwOnChunkIndex: number | null = null;

  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][] {
    const chunks: ExpoPushMessage[][] = [];
    for (let i = 0; i < messages.length; i += this.chunkSize) {
      chunks.push(messages.slice(i, i + this.chunkSize));
    }
    return chunks;
  }

  async sendPushNotificationsAsync(
    messages: ExpoPushMessage[],
  ): Promise<ExpoPushTicket[]> {
    const idx = this.sentChunks.length;
    this.sentChunks.push(messages);
    if (this.throwOnChunkIndex === idx) throw new Error("network");
    return messages.map((m) =>
      this.ticketFor(typeof m.to === "string" ? m.to : String(m.to)),
    );
  }
}

const deviceNotRegistered = (): ExpoPushTicket =>
  ({
    status: "error",
    message: "dead",
    details: { error: "DeviceNotRegistered" },
  }) as ExpoPushTicket;

function msg(to: string): PushMessage {
  return { to, title: "Verse of the Day", body: "John 3:16 — ..." };
}

function makeClient(fake: FakeExpo): ExpoPushClient {
  return new ExpoPushClient(undefined, fake);
}

describe("ExpoPushClient.send", () => {
  it("filters malformed tokens as InvalidToken and does not send them", async () => {
    const fake = new FakeExpo();
    const results = await makeClient(fake).send([
      msg(TOK_A),
      msg("not-a-token"),
    ]);

    const invalid = results.find((r) => r.token === "not-a-token");
    expect(invalid).toEqual({
      token: "not-a-token",
      ok: false,
      error: "InvalidToken",
    });
    // Only the valid token was actually sent.
    expect(fake.sentChunks.flat().map((m) => m.to)).toEqual([TOK_A]);
    expect(results.find((r) => r.token === TOK_A)?.ok).toBe(true);
  });

  it("maps ok / DeviceNotRegistered tickets back to the right token", async () => {
    const fake = new FakeExpo();
    fake.ticketFor = (to) =>
      to === TOK_B
        ? deviceNotRegistered()
        : ({ status: "ok", id: "r" } as ExpoPushTicket);

    const results = await makeClient(fake).send([msg(TOK_A), msg(TOK_B)]);

    expect(results.find((r) => r.token === TOK_A)).toEqual({
      token: TOK_A,
      ok: true,
    });
    expect(results.find((r) => r.token === TOK_B)).toEqual({
      token: TOK_B,
      ok: false,
      error: "DeviceNotRegistered",
    });
  });

  it("keeps token↔ticket alignment across multiple chunks", async () => {
    const fake = new FakeExpo();
    fake.chunkSize = 1; // force 3 separate chunks
    fake.ticketFor = (to) =>
      to === TOK_C
        ? deviceNotRegistered()
        : ({ status: "ok", id: "r" } as ExpoPushTicket);

    const results = await makeClient(fake).send([
      msg(TOK_A),
      msg(TOK_B),
      msg(TOK_C),
    ]);

    expect(fake.sentChunks).toHaveLength(3);
    expect(results.find((r) => r.token === TOK_A)?.ok).toBe(true);
    expect(results.find((r) => r.token === TOK_B)?.ok).toBe(true);
    expect(results.find((r) => r.token === TOK_C)?.error).toBe(
      "DeviceNotRegistered",
    );
  });

  it("a chunk transport failure fails only that chunk (no prune) and offset still advances", async () => {
    const fake = new FakeExpo();
    fake.chunkSize = 1;
    fake.throwOnChunkIndex = 0; // first chunk (TOK_A) throws

    const results = await makeClient(fake).send([msg(TOK_A), msg(TOK_B)]);

    const a = results.find((r) => r.token === TOK_A);
    const b = results.find((r) => r.token === TOK_B);
    expect(a?.ok).toBe(false);
    expect(a?.error).toBe("network"); // transient, not DeviceNotRegistered → no prune
    // Offset advanced correctly: TOK_B (chunk 1) still sent and mapped to ok.
    expect(b?.ok).toBe(true);
  });
});
