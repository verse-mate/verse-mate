import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import type { Server } from "bun";
import shared from "../shared/shared.plugin";
import { createTestUser } from "../shared/test-helpers";
import { SupportService } from "./services/support.service";

const conn = shared.store.db.getOrCreateConnection();
const originalUrl = process.env.SLACK_API_URL;

let stub: Server;
let received: string[] = [];
let userId: string;

const restoreUrl = () => {
  if (originalUrl === undefined) {
    Reflect.deleteProperty(process.env, "SLACK_API_URL");
  } else {
    process.env.SLACK_API_URL = originalUrl;
  }
};

beforeAll(async () => {
  stub = Bun.serve({
    port: 0,
    fetch(request) {
      received.push(new URL(request.url).pathname);
      return Response.json({ ok: true, ts: `${Date.now() / 1000}` });
    },
  });
  userId = (await createTestUser()).userId;
});

afterEach(() => {
  restoreUrl();
  received = [];
});

afterAll(async () => {
  stub.stop(true);
  await conn
    .deleteFrom("support_conversations")
    .where("user_id", "=", userId)
    .execute();
  await conn.deleteFrom("user").where("id", "=", userId).execute();
});

describe("Support Slack API base URL", () => {
  it("posts a new conversation to SLACK_API_URL when it is set", async () => {
    process.env.SLACK_API_URL = `http://127.0.0.1:${stub.port}/api/`;
    const service = new SupportService(shared.store.db);

    const result = await service.handleNewConversation(
      userId,
      faker.lorem.sentence(),
    );

    expect(result.success).toBe(true);
    expect(received).toEqual(["/api/chat.postMessage"]);
  });

  it("talks to Slack itself when SLACK_API_URL is unset", () => {
    Reflect.deleteProperty(process.env, "SLACK_API_URL");
    const service = new SupportService(shared.store.db);

    const client = (
      service as unknown as { slackClient: { slackApiUrl: string } }
    ).slackClient;
    expect(client.slackApiUrl).toBe("https://slack.com/api/");
  });
});
