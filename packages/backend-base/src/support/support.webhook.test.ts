import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import SupportStatusEnum from "database/src/models/public/SupportStatusEnum";
import shared from "../shared/shared.plugin";
import { SupportService } from "./services/support.service";
import supportPlugin from "./support.plugin";

const conn = shared.store.db.getOrCreateConnection();
const SECRET = faker.string.alphanumeric(32);
const originalSecret = process.env.SLACK_SIGNING_SECRET;

let userId: string;
let threadTs: string;

const nowSeconds = () => Math.floor(Date.now() / 1000);

const sign = (timestamp: string, body: string, secret = SECRET) =>
  `v0=${crypto
    .createHmac("sha256", secret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;

const post = (body: string, headers: Record<string, string> = {}) =>
  supportPlugin.handle(
    new Request("http://localhost/webhooks/slack", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
  );

const signedPost = (body: string, timestamp = String(nowSeconds())) =>
  post(body, {
    "x-slack-signature": sign(timestamp, body),
    "x-slack-request-timestamp": timestamp,
  });

const replyEvent = (text: string) =>
  JSON.stringify({
    type: "event_callback",
    event: { type: "message", thread_ts: threadTs, text },
  });

const supportMessages = () =>
  conn
    .selectFrom("support_messages")
    .innerJoin(
      "support_conversations",
      "support_conversations.id",
      "support_messages.conversation_id",
    )
    .where("support_conversations.slack_thread_ts", "=", threadTs)
    .select(["support_messages.text", "support_messages.sender"])
    .execute();

beforeAll(async () => {
  const user = await conn
    .insertInto("user")
    .values({
      email: `support-${faker.string.uuid()}@example.test`,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  userId = user.id;
  threadTs = `${nowSeconds()}.${faker.string.numeric(6)}`;
  await conn
    .insertInto("support_conversations")
    .values({
      user_id: userId,
      slack_thread_ts: threadTs,
      status: SupportStatusEnum.open,
    })
    .execute();
});

afterAll(async () => {
  await conn
    .deleteFrom("support_conversations")
    .where("user_id", "=", userId)
    .execute();
  await conn.deleteFrom("user").where("id", "=", userId).execute();
});

beforeEach(() => {
  process.env.SLACK_SIGNING_SECRET = SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) {
    Reflect.deleteProperty(process.env, "SLACK_SIGNING_SECRET");
  } else {
    process.env.SLACK_SIGNING_SECRET = originalSecret;
  }
});

describe("Slack support webhook", () => {
  it("stores a reply signed over the raw body", async () => {
    const text = faker.lorem.sentence();
    const body = `{ "type": "event_callback",  "event": { "type": "message", "thread_ts": "${threadTs}", "text": "${text}" } }`;

    const res = await signedPost(body);

    expect(res.status).toBe(200);
    expect(await supportMessages()).toContainEqual({ text, sender: "support" });
  });

  it("answers Slack's URL verification challenge", async () => {
    const challenge = faker.string.alphanumeric(24);

    const res = await signedPost(
      JSON.stringify({ type: "url_verification", challenge }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge });
  });

  it("refuses an unsigned request", async () => {
    const text = faker.lorem.sentence();

    const res = await post(replyEvent(text));

    expect(res.status).toBe(401);
    expect(await supportMessages()).not.toContainEqual(
      expect.objectContaining({ text }),
    );
  });

  it("refuses a request signed with another secret", async () => {
    const text = faker.lorem.sentence();
    const body = replyEvent(text);
    const timestamp = String(nowSeconds());

    const res = await post(body, {
      "x-slack-signature": sign(timestamp, body, faker.string.alphanumeric(32)),
      "x-slack-request-timestamp": timestamp,
    });

    expect(res.status).toBe(401);
    expect(await supportMessages()).not.toContainEqual(
      expect.objectContaining({ text }),
    );
  });

  it("refuses a request whose body differs from the signed one", async () => {
    const timestamp = String(nowSeconds());
    const text = faker.lorem.sentence();

    const res = await post(replyEvent(text), {
      "x-slack-signature": sign(timestamp, replyEvent("original")),
      "x-slack-request-timestamp": timestamp,
    });

    expect(res.status).toBe(401);
    expect(await supportMessages()).not.toContainEqual(
      expect.objectContaining({ text }),
    );
  });

  it("refuses a correctly signed request older than five minutes", async () => {
    const text = faker.lorem.sentence();

    const res = await signedPost(
      replyEvent(text),
      String(nowSeconds() - 5 * 60 - 1),
    );

    expect(res.status).toBe(401);
    expect(await supportMessages()).not.toContainEqual(
      expect.objectContaining({ text }),
    );
  });

  it("refuses a correctly signed request dated more than five minutes ahead", async () => {
    const text = faker.lorem.sentence();

    const res = await signedPost(
      replyEvent(text),
      String(nowSeconds() + 5 * 60 + 1),
    );

    expect(res.status).toBe(401);
    expect(await supportMessages()).not.toContainEqual(
      expect.objectContaining({ text }),
    );
  });

  it("refuses a signed request whose timestamp is not a number", async () => {
    const text = faker.lorem.sentence();

    const res = await signedPost(replyEvent(text), `${nowSeconds()}abc`);

    expect(res.status).toBe(401);
    expect(await supportMessages()).not.toContainEqual(
      expect.objectContaining({ text }),
    );
  });

  it("refuses every request when the signing secret is not configured", async () => {
    process.env.SLACK_SIGNING_SECRET = "";
    const text = faker.lorem.sentence();
    const body = replyEvent(text);
    const timestamp = String(nowSeconds());

    const res = await post(body, {
      "x-slack-signature": sign(timestamp, body, ""),
      "x-slack-request-timestamp": timestamp,
    });

    expect(res.status).toBe(401);
    expect(await supportMessages()).not.toContainEqual(
      expect.objectContaining({ text }),
    );
  });

  it("warns at construction when the signing secret is not configured", () => {
    process.env.SLACK_SIGNING_SECRET = "";
    const warn = spyOn(console, "warn").mockImplementation(() => {});

    try {
      new SupportService(shared.store.db);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
