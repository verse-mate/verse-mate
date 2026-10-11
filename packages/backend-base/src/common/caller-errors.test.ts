import { beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { Elysia } from "elysia";

import adminPlugin from "../admin/admin.plugin";
import authPlugin from "../auth/auth.plugin";
import { resolveLanguageCode } from "../shared/i18n/resolve-language-code";
import { createTestUser } from "../shared/test-helpers";
import supportPlugin from "../support/support.plugin";
import { ValidationError } from "./errors";

const app = new Elysia().use(authPlugin).use(adminPlugin).use(supportPlugin);

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
  });
});
