import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import type SupportSenderEnum from "database/src/models/public/SupportSenderEnum";

import authPlugin from "../auth/auth.plugin";
import { createTestUser } from "../shared/test-helpers";
import { SupportRepository } from "./repository/support.repository";
import Backend from "./support.plugin";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

describe("Support conversations answer only their owner", () => {
  const plugin = Backend.use(authPlugin);
  let owner: TestUser;
  let other: TestUser;
  let conversationId: string;

  const call = async (
    method: string,
    path: string,
    options: { token?: string; body?: unknown } = {},
  ) => {
    const headers: Record<string, string> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.body !== undefined)
      headers["content-type"] = "application/json";
    const response = await plugin.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
    );
    const text = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: response.status, json };
  };

  beforeAll(async () => {
    owner = await createTestUser();
    other = await createTestUser();
    const repository = new SupportRepository(plugin.store.db);
    const conversation = await repository.createConversation(
      owner.userId,
      `${faker.number.int({ min: 1_000_000, max: 9_999_999 })}.000100`,
      faker.lorem.words(3),
    );
    conversationId = conversation.id;
    await repository.addMessage(
      conversationId,
      owner.userId,
      faker.lorem.sentence(),
      "user" as SupportSenderEnum,
    );
  });

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  it("refuses a caller with no token", async () => {
    const res = await call(
      "GET",
      `/support/conversations/${conversationId}/messages`,
    );
    expect(res.status).toBe(401);
  });

  it("answers another user's read and write with 404, as for a missing conversation", async () => {
    const read = await call(
      "GET",
      `/support/conversations/${conversationId}/messages`,
      { token: other.accessToken },
    );
    expect(read.status).toBe(404);

    const write = await call(
      "POST",
      `/support/conversations/${conversationId}/messages`,
      { token: other.accessToken, body: { text: faker.lorem.sentence() } },
    );
    expect(write.status).toBe(404);

    const missing = await call(
      "GET",
      `/support/conversations/${faker.string.uuid()}/messages`,
      { token: owner.accessToken },
    );
    expect(missing.status).toBe(404);
  });

  it("answers the owner with their messages", async () => {
    const res = await call(
      "GET",
      `/support/conversations/${conversationId}/messages`,
      { token: owner.accessToken },
    );
    expect(res.status).toBe(200);
    expect(res.json.messages.length).toBe(1);
  });
});
