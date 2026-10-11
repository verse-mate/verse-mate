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
      ts: `${NOW}.${faker.string.numeric(6)}`,
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
  threadTs = `${NOW}.${faker.string.numeric(6)}`;
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
    const body = `{ "type": "event_callback",  "event": { "type": "message", "channel": "${CHANNEL}", "thread_ts": "${threadTs}", "ts": "${NOW}.000001", "text": "${text}" } }`;

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
    const retry = await post(body, {
      ...signedHeaders(body),
      "x-slack-retry-num": "1",
      "x-slack-retry-reason": "http_timeout",
    });

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect((await storedTexts()).filter((t) => t === text)).toHaveLength(1);
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

  it("ignores a message without text", async () => {
    const res = await signedPost(replyEvent("", { text: undefined }));

    expect(res.status).toBe(200);
    expect(await storedTexts()).not.toContain("");
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
      ts: `${NOW}.${faker.string.numeric(6)}`,
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

  it("escapes Slack control sequences in a follow-up message and stores the original", async () => {
    const service = new SupportService(shared.store.db);
    const postMessage = capture(service);
    const conversation = await conn
      .selectFrom("support_conversations")
      .where("slack_thread_ts", "=", threadTs)
      .select("id")
      .executeTakeFirstOrThrow();
    const text = `${ping} & ${disguisedLink}`;

    await service.handleUserMessage(userId as string, conversation.id, text);

    const sent = sentText(postMessage);
    expect(sent).toContain("&lt;!channel&gt; please look &amp; &lt;https://");
    expect(sent).not.toContain("<!channel>");
    expect(await storedTexts()).toContain(text);
  });
});
