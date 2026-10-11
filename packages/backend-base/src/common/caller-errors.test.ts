import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { Elysia } from "elysia";

import adminPlugin from "../admin/admin.plugin";
import authPlugin from "../auth/auth.plugin";
import biblePlugin from "../bible/bible.plugin";
import {
  canonicalizeLanguageCode,
  resolveLanguageCode,
} from "../shared/i18n/resolve-language-code";
import { createTestUser } from "../shared/test-helpers";
import supportPlugin from "../support/support.plugin";
import { ValidationError } from "./errors";

const app = new Elysia()
  .use(authPlugin)
  .use(adminPlugin)
  .use(supportPlugin)
  .use(biblePlugin);

async function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

describe("errors about the caller's request keep their message and a 4xx status", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>;
  let reader: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    admin = await createTestUser({ isAdmin: true });
    reader = await createTestUser({ isAdmin: false });
  });

  afterAll(async () => {
    const db = adminPlugin.store.db.getOrCreateConnection();
    await db
      .deleteFrom("batch_jobs")
      .where("created_by", "in", [admin.userId, reader.userId])
      .execute();
    await db
      .deleteFrom("user")
      .where("id", "in", [admin.userId, reader.userId])
      .execute();
  });

  it("a support conversation that is not the caller's is not found", async () => {
    const id = randomUUID();
    for (const [method, body] of [
      ["GET", undefined],
      ["POST", { text: "hello" }],
    ] as const)
      expect(
        await call(
          method,
          `/support/conversations/${id}/messages`,
          reader.accessToken,
          body,
        ),
      ).toEqual({
        status: 404,
        body: { error: "NOT_FOUND", message: "Conversation not found" },
      });
  });

  it("support without a session answers 401", async () => {
    expect(await call("GET", "/support/conversations")).toEqual({
      status: 401,
      body: { error: "UNAUTHORIZED", message: "Authentication required" },
    });
  });

  it("an admin topic that does not exist is not found", async () => {
    const id = randomUUID();
    const answer = {
      status: 404,
      body: { error: "NOT_FOUND", message: `Topic with ID ${id} not found` },
    };
    expect(
      await call("PUT", `/admin/topics/${id}`, admin.accessToken, {
        name: "Renamed",
      }),
    ).toEqual(answer);
    expect(
      await call("DELETE", `/admin/topics/${id}`, admin.accessToken),
    ).toEqual(answer);
  });

  it("an admin topic with an unknown category is refused with the categories", async () => {
    const answer = {
      status: 400,
      body: {
        error: "VALIDATION_ERROR",
        message:
          "Invalid category: BOGUS. Must be one of: EVENT, PROPHECY, PARABLE, THEME",
      },
    };
    expect(
      await call("PUT", `/admin/topics/${randomUUID()}`, admin.accessToken, {
        category: "BOGUS",
      }),
    ).toEqual(answer);
    expect(
      await call("POST", "/admin/topics", admin.accessToken, {
        name: "Never created",
        category: "BOGUS",
      }),
    ).toEqual(answer);
  });

  it("an explanation batch for a topic with nothing to explain is not found and leaves no batch behind", async () => {
    const answer = await call(
      "POST",
      "/admin/batch-topic-explanations",
      admin.accessToken,
      {
        model: "gpt-5-nano",
        languageCode: "en",
        explanationTypes: ["summary"],
        topicId: randomUUID(),
      },
    );
    expect(answer.status).toBe(404);
    expect(answer.body.error).toBe("NOT_FOUND");
    expect(answer.body.message).toStartWith("No topics found");
    const left = await adminPlugin.store.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .select("id")
      .where("created_by", "=", admin.userId)
      .where("batch_type", "=", "topic-explanations-parent")
      .execute();
    expect(left).toEqual([]);
  });

  it("cancelling a book batch that never reached the provider is a conflict", async () => {
    const batch = await adminPlugin.store.db
      .getOrCreateConnection()
      .insertInto("batch_jobs")
      .values({
        batch_type: "book",
        status: "pending",
        model: "gpt-5-nano",
        bible_version: "NASB1995",
        explanation_types: ["summary"],
        created_by: admin.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    expect(
      await call("DELETE", `/admin/batch/${batch.id}`, admin.accessToken),
    ).toEqual({
      status: 409,
      body: {
        error: "CONFLICT",
        message: `Book batch ${batch.id} does not have an OpenAI batch ID.`,
      },
    });
  });

  it("cancelling a batch that does not exist is not found", async () => {
    const id = 2_000_000_000;
    expect(
      await call("DELETE", `/admin/batch/${id}`, admin.accessToken),
    ).toEqual({
      status: 404,
      body: { error: "NOT_FOUND", message: `Batch job ${id} not found.` },
    });
  });
});

describe("an invalid language code", () => {
  it("is a validation error", () => {
    expect(() => resolveLanguageCode("english")).toThrow(ValidationError);
    expect(() => canonicalizeLanguageCode("english")).toThrow(ValidationError);
  });

  it("asked of a chapter explanation answers 400 with the reason", async () => {
    expect(
      await call("GET", "/bible/book/explanation/1/1?lang=english"),
    ).toEqual({
      status: 400,
      body: {
        error: "VALIDATION_ERROR",
        message:
          'Invalid language code "english". Expected BCP-47 format: "en" or "en-US".',
      },
    });
  });
});
