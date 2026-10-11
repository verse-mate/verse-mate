import {
  type Mock,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
  spyOn,
} from "bun:test";
import crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import type { WebClient } from "@slack/web-api";
import SupportSenderEnum from "database/src/models/public/SupportSenderEnum";
import SupportStatusEnum from "database/src/models/public/SupportStatusEnum";
import { Elysia } from "elysia";
import shared from "../shared/shared.plugin";
import { SupportService } from "./services/support.service";
import supportPlugin from "./support.plugin";

const conn = shared.store.db.getOrCreateConnection();
const SECRET = faker.string.alphanumeric(32);
const CHANNEL = process.env.SLACK_SUPPORT_CHANNEL_ID || "";
const NOW = Math.floor(Date.now() / 1000);
const WINDOW = 5 * 60;
const originalSecret = process.env.SLACK_SIGNING_SECRET;

let userId: string | undefined;
let threadTs: string;
let warn: Mock<typeof console.warn>;
let seq = 0;

const nextTs = () => `${NOW}.${String(++seq).padStart(6, "0")}`;

const restoreSecret = () => {
  if (originalSecret === undefined) {
    Reflect.deleteProperty(process.env, "SLACK_SIGNING_SECRET");
  } else {
    process.env.SLACK_SIGNING_SECRET = originalSecret;
  }
};

const slackClientOf = (service: SupportService) =>
  (service as unknown as { slackClient: WebClient }).slackClient;

const sign = (timestamp: string, body: string, secret = SECRET) =>
  `v0=${crypto
    .createHmac("sha256", secret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;

const post = (
  body: string,
  headers: Record<string, string> = {},
  app: { handle: (request: Request) => Promise<Response> } = supportPlugin,
) =>
  app.handle(
    new Request("http://localhost/webhooks/slack", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
  );

const signedHeaders = (body: string, timestamp = String(NOW)) => ({
  "x-slack-signature": sign(timestamp, body),
  "x-slack-request-timestamp": timestamp,
});

const signedPost = (body: string, timestamp = String(NOW)) =>
  post(body, signedHeaders(body, timestamp));

const replyEvent = (text: string, event: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "event_callback",
    event_id: `Ev${faker.string.alphanumeric(10)}`,
    event: {
      type: "message",
      channel: CHANNEL,
      thread_ts: threadTs,
      ts: nextTs(),
      text,
      ...event,
    },
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

const storedTexts = async () => (await supportMessages()).map((m) => m.text);

const expectRefused = async (res: Response, text: string) => {
  expect(res.status).toBe(401);
  expect(await storedTexts()).not.toContain(text);
};

const expectIgnored = async (res: Response, text: string) => {
  expect(res.status).toBe(200);
  expect(await storedTexts()).not.toContain(text);
};

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
  threadTs = `${NOW - 1}.${faker.string.numeric(6)}`;
  const conversation = await conn
    .insertInto("support_conversations")
    .values({
      user_id: userId,
      slack_thread_ts: threadTs,
      status: SupportStatusEnum.open,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await conn
    .insertInto("support_messages")
    .values({
      conversation_id: conversation.id,
      user_id: userId,
      text: "control",
      sender: SupportSenderEnum.support,
    })
    .execute();
  expect(await storedTexts()).toEqual(["control"]);
});

afterAll(async () => {
  if (!userId) return;
  await conn
    .deleteFrom("support_conversations")
    .where("user_id", "=", userId)
    .execute();
  await conn.deleteFrom("user").where("id", "=", userId).execute();
});

beforeEach(() => {
  process.env.SLACK_SIGNING_SECRET = SECRET;
  setSystemTime(new Date(NOW * 1000));
  warn = spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  restoreSecret();
  setSystemTime();
  warn.mockRestore();
});

describe("Slack support webhook: accepted requests", () => {
  it("stores a reply signed over the raw body", async () => {
    const text = faker.lorem.sentence();
    const body = `{ "type": "event_callback",  "event": { "type": "message", "channel": "${CHANNEL}", "thread_ts": "${threadTs}", "ts": "${NOW - 2}.000001", "text": "${text}" } }`;

    const res = await signedPost(body);

    expect(res.status).toBe(200);
    expect(await supportMessages()).toContainEqual({ text, sender: "support" });
  });

  it("keeps the raw body when another hook in the app reads the body", async () => {
    const app = new Elysia()
      .onBeforeHandle({ as: "global" }, ({ body }) => {
        expect(body).toBeDefined();
      })
      .use(supportPlugin);
    const text = faker.lorem.sentence();
    const body = replyEvent(text);

    const res = await post(body, signedHeaders(body), app);

    expect(res.status).toBe(200);
    expect(await storedTexts()).toContain(text);
  });

  it("answers Slack's URL verification challenge", async () => {
    const challenge = faker.string.alphanumeric(24);

    const res = await signedPost(
      JSON.stringify({ type: "url_verification", challenge }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge });
  });

  it("accepts a request exactly five minutes old", async () => {
    const text = faker.lorem.sentence();

    const res = await signedPost(replyEvent(text), String(NOW - WINDOW));

    expect(res.status).toBe(200);
    expect(await storedTexts()).toContain(text);
  });

  it("accepts a request dated exactly five minutes ahead", async () => {
    const text = faker.lorem.sentence();

    const res = await signedPost(replyEvent(text), String(NOW + WINDOW));

    expect(res.status).toBe(200);
    expect(await storedTexts()).toContain(text);
  });

  it("stores a reply once when Slack retries the delivery", async () => {
    const text = faker.lorem.sentence();
    const body = replyEvent(text);

    const first = await post(body, signedHeaders(body));
    const deliveredAt = new Date("2020-01-01T00:00:00Z");
    await conn
      .updateTable("support_conversations")
      .set({ last_message_at: deliveredAt })
      .where("slack_thread_ts", "=", threadTs)
      .execute();
    const retry = await post(body, {
      ...signedHeaders(body),
      "x-slack-retry-num": "1",
      "x-slack-retry-reason": "http_timeout",
    });

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect((await storedTexts()).filter((t) => t === text)).toHaveLength(1);
    const conversation = await conn
      .selectFrom("support_conversations")
      .where("slack_thread_ts", "=", threadTs)
      .select("last_message_at")
      .executeTakeFirstOrThrow();
    expect(conversation.last_message_at).toEqual(deliveredAt);
  });

  it("stores Slack's entity-encoded text as the agent typed it", async () => {
    const res = await signedPost(
      replyEvent("Q &amp; A &lt;here&gt;, literally &amp;lt;b&amp;gt;"),
    );

    expect(res.status).toBe(200);
    expect(await storedTexts()).toContain("Q & A <here>, literally &lt;b&gt;");
  });
});

describe("Slack support webhook: refused requests", () => {
  it("refuses an unsigned request", async () => {
    const text = faker.lorem.sentence();

    await expectRefused(await post(replyEvent(text)), text);
  });

  it("refuses a request with a signature and no timestamp", async () => {
    const text = faker.lorem.sentence();
    const body = replyEvent(text);

    const res = await post(body, {
      "x-slack-signature": signedHeaders(body)["x-slack-signature"],
    });

    await expectRefused(res, text);
  });

  it("refuses a request with a timestamp and no signature", async () => {
    const text = faker.lorem.sentence();

    const res = await post(replyEvent(text), {
      "x-slack-request-timestamp": String(NOW),
    });

    await expectRefused(res, text);
  });

  it("refuses a request signed with another secret", async () => {
    const text = faker.lorem.sentence();
    const body = replyEvent(text);

    const res = await post(body, {
      "x-slack-signature": sign(
        String(NOW),
        body,
        faker.string.alphanumeric(32),
      ),
      "x-slack-request-timestamp": String(NOW),
    });

    await expectRefused(res, text);
  });

  it.each([
    ["too short", () => "v0=abc"],
    ["another scheme", (valid: string) => valid.replace(/^v0=/, "v1=")],
  ])("refuses a malformed signature (%s)", async (_, malform) => {
    const text = faker.lorem.sentence();
    const body = replyEvent(text);
    const headers = signedHeaders(body);

    const res = await post(body, {
      ...headers,
      "x-slack-signature": malform(headers["x-slack-signature"]),
    });

    await expectRefused(res, text);
  });

  it("refuses a request whose body differs from the signed one", async () => {
    const text = faker.lorem.sentence();

    const res = await post(replyEvent(text), signedHeaders(replyEvent("x")));

    await expectRefused(res, text);
  });

  it("refuses an old signature replayed with a fresh timestamp", async () => {
    const text = faker.lorem.sentence();
    const body = replyEvent(text);

    const res = await post(body, {
      "x-slack-signature": sign(String(NOW - 2 * WINDOW), body),
      "x-slack-request-timestamp": String(NOW),
    });

    await expectRefused(res, text);
  });

  it("refuses a correctly signed request older than five minutes", async () => {
    const text = faker.lorem.sentence();

    await expectRefused(
      await signedPost(replyEvent(text), String(NOW - WINDOW - 1)),
      text,
    );
  });

  it("refuses a correctly signed request dated more than five minutes ahead", async () => {
    const text = faker.lorem.sentence();

    await expectRefused(
      await signedPost(replyEvent(text), String(NOW + WINDOW + 1)),
      text,
    );
  });

  it.each(["", "-1", ` ${NOW}`, `${NOW}.5`, `${NOW}abc`, "1".repeat(20)])(
    "refuses a signed request with timestamp %p",
    async (timestamp) => {
      const text = faker.lorem.sentence();

      await expectRefused(await signedPost(replyEvent(text), timestamp), text);
    },
  );

  it.each([
    [
      "unset",
      () => Reflect.deleteProperty(process.env, "SLACK_SIGNING_SECRET"),
    ],
    [
      "empty",
      () => {
        process.env.SLACK_SIGNING_SECRET = "";
      },
    ],
  ])(
    "refuses every request when the signing secret is %s",
    async (_, clear) => {
      clear();
      const text = faker.lorem.sentence();
      const body = replyEvent(text);

      const res = await post(body, {
        "x-slack-signature": sign(String(NOW), body, ""),
        "x-slack-request-timestamp": String(NOW),
      });

      await expectRefused(res, text);
    },
  );

  it("logs each refusal without the body or the signature", async () => {
    const text = faker.lorem.sentence();
    const body = replyEvent(text);
    const signature = sign(String(NOW), body, "wrong");

    await post(body, {
      "x-slack-signature": signature,
      "x-slack-request-timestamp": String(NOW),
      "x-slack-retry-num": "2",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain("retry 2");
    expect(line).not.toContain(text);
    expect(line).not.toContain(signature);
  });
});

describe("Slack support webhook: signed events that are not support replies", () => {
  it.each([
    ["a bot message", { bot_id: "B123" }],
    ["a message without a thread", { thread_ts: undefined }],
    ["a reply in an unknown thread", { thread_ts: `${NOW}.999999` }],
    ["a message from another channel", { channel: `${CHANNEL}OTHER` }],
    ["an event that is not a message", { type: "reaction_added" }],
  ])("ignores %s", async (_, override) => {
    const text = faker.lorem.sentence();

    await expectIgnored(await signedPost(replyEvent(text, override)), text);
  });

  it.each([
    ["no text", undefined],
    ["empty text", ""],
    ["blank text", "   "],
  ])("ignores a message with %s", async (_, text) => {
    const before = await storedTexts();

    const res = await signedPost(replyEvent("", { text }));

    expect(res.status).toBe(200);
    expect(await storedTexts()).toEqual(before);
  });

  it("logs the channel of a message from another channel", async () => {
    await signedPost(
      replyEvent(faker.lorem.sentence(), { channel: "C0FOREIGN" }),
    );

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("C0FOREIGN"));
  });
});

describe("Slack signing secret configuration", () => {
  it.each([
    [
      "unset",
      () => Reflect.deleteProperty(process.env, "SLACK_SIGNING_SECRET"),
    ],
    [
      "empty",
      () => {
        process.env.SLACK_SIGNING_SECRET = "";
      },
    ],
  ])("warns at construction when the secret is %s", (_, clear) => {
    clear();

    new SupportService(shared.store.db);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("SLACK_SIGNING_SECRET"),
    );
  });

  it("does not warn at construction when the secret is set", () => {
    new SupportService(shared.store.db);

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Messages sent to Slack", () => {
  const ping = "<!channel> please look";
  const disguisedLink = "<https://phish.example/login|Re-authenticate here>";

  const capture = (service: SupportService) =>
    spyOn(slackClientOf(service).chat, "postMessage").mockResolvedValue({
      ok: true,
      ts: nextTs(),
    } as never);

  const sentText = (postMessage: ReturnType<typeof capture>) =>
    JSON.stringify(postMessage.mock.calls.map(([args]) => args));

  it("escapes Slack control sequences in a new conversation", async () => {
    const service = new SupportService(shared.store.db);
    const postMessage = capture(service);

    await service.handleNewConversation(
      userId as string,
      `${ping} ${disguisedLink}`,
      ping,
    );

    const sent = sentText(postMessage);
    expect(sent).toContain("&lt;!channel&gt;");
    expect(sent).toContain(
      "&lt;https://phish.example/login|Re-authenticate here&gt;",
    );
    expect(sent).not.toContain("<!channel>");
    expect(sent).not.toContain("<https://phish.example");
  });

  it("escapes Slack control sequences in the user's name and email", async () => {
    const uid = userId as string;
    const original = await conn
      .selectFrom("user")
      .where("id", "=", uid)
      .select(["firstName", "lastName"])
      .executeTakeFirstOrThrow();
    await conn
      .updateTable("user")
      .set({ firstName: "<!here>", lastName: "Eve & Co" })
      .where("id", "=", uid)
      .execute();
    const service = new SupportService(shared.store.db);
    const postMessage = capture(service);

    try {
      await service.handleNewConversation(uid, faker.lorem.sentence());
    } finally {
      await conn
        .updateTable("user")
        .set(original)
        .where("id", "=", uid)
        .execute();
    }

    const sent = sentText(postMessage);
    expect(sent).toContain("&lt;!here&gt; Eve &amp; Co");
    expect(sent).not.toContain("<!here>");
  });

  const conversationId = async () =>
    (
      await conn
        .selectFrom("support_conversations")
        .where("slack_thread_ts", "=", threadTs)
        .select("id")
        .executeTakeFirstOrThrow()
    ).id;

  it("escapes Slack control sequences in a follow-up message and stores the original", async () => {
    const service = new SupportService(shared.store.db);
    const postMessage = capture(service);
    const text = `${ping} & ${disguisedLink}`;

    await service.handleUserMessage(
      userId as string,
      await conversationId(),
      text,
    );

    const sent = sentText(postMessage);
    expect(sent).toContain("&lt;!channel&gt; please look &amp; &lt;https://");
    expect(sent).not.toContain("<!channel>");
    expect(await storedTexts()).toContain(text);
  });

  const sectionTexts = (postMessage: ReturnType<typeof capture>) =>
    (
      (
        postMessage.mock.calls[0][0] as {
          blocks?: { text?: { text: string } }[];
        }
      ).blocks ?? []
    ).map((block) => block.text?.text ?? "");

  const decodeEntities = (value: string) =>
    value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

  it("splits a long new conversation into sections Slack accepts", async () => {
    const service = new SupportService(shared.store.db);
    const postMessage = capture(service);
    const text = `${"<&>".repeat(2000)}${faker.lorem.paragraphs(20)}`;

    await service.handleNewConversation(userId as string, text);

    const [header, ...body] = sectionTexts(postMessage);
    expect(header).toContain("New Support Request");
    expect(body.length).toBeGreaterThan(1);
    for (const section of [header, ...body]) {
      expect(section.length).toBeLessThanOrEqual(3000);
    }
    expect(decodeEntities(body.join(""))).toBe(text);
  });

  it("splits a long follow-up message into sections and stores it in full", async () => {
    const service = new SupportService(shared.store.db);
    const postMessage = capture(service);
    const text = `${"&".repeat(5000)} ${faker.lorem.paragraphs(10)}`;

    await service.handleUserMessage(
      userId as string,
      await conversationId(),
      text,
    );

    const sections = sectionTexts(postMessage);
    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections) {
      expect(section.length).toBeLessThanOrEqual(3000);
    }
    expect(decodeEntities(sections.join(""))).toBe(text);
    expect(await storedTexts()).toContain(text);
  });

  it("keeps the Slack id out of the messages a user reads", async () => {
    const service = new SupportService(shared.store.db);

    const messages = await service.getMessages(
      await conversationId(),
      userId as string,
    );

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toHaveProperty("slack_ts");
    }
  });
});

describe("Support message limits", () => {
  const send = (path: string, body: Record<string, unknown>) =>
    supportPlugin.handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  it.each([
    ["/support/conversations"],
    [`/support/conversations/${faker.string.uuid()}/messages`],
  ])("accepts 20,000 characters and refuses more on %s", async (path) => {
    const atLimit = await send(path, { text: "a".repeat(20_000) });
    const overLimit = await send(path, { text: "a".repeat(20_001) });

    expect(atLimit.status).not.toBe(422);
    expect(overLimit.status).toBe(422);
  });

  it("refuses a subject longer than the stored column", async () => {
    const res = await send("/support/conversations", {
      text: "help",
      subject: "s".repeat(256),
    });

    expect(res.status).toBe(422);
  });
});
