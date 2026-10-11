import {
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
import { faker } from "@faker-js/faker";
import cacheConstants from "../../shared/cache.constants";
import { getTestClient } from "../../shared/test-client";
import Backend, { type AuthPlugin } from "../auth.plugin";
import { ssoProviderFactory } from "./sso-provider.factory";
import type { SSOProvider } from "./sso-provider.interface";

const FRONTEND_URL = "http://localhost:3000";

function stubProvider(
  name: "google" | "apple",
  email: string,
  providerUserId: string,
): SSOProvider {
  return {
    name,
    verifyToken: async () => ({ idToken: "stub", claims: {} }),
    getUserInfo: async () => ({
      providerUserId,
      email,
      emailVerified: true,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    }),
  };
}

describe("SSO web callback code exchange", () => {
  const client = getTestClient<AuthPlugin>(Backend);
  const cache = Backend.store.cache;
  const db = Backend.store.db;
  const originalEnv = { ...process.env };
  const emails: string[] = [];
  let providerSpy: ReturnType<typeof spyOn>;

  beforeAll(() => {
    process.env.BACKEND_URL = "http://localhost:3001";
    process.env.FRONTEND_URL = FRONTEND_URL;
  });

  beforeEach(async () => {
    const email = faker.internet.email().toLowerCase();
    emails.push(email);
    const providerUserId = faker.string.uuid();
    providerSpy = spyOn(ssoProviderFactory, "getProvider").mockImplementation(
      (name) => stubProvider(name, email, providerUserId),
    );
    await cache.delete("rate-limit:sso-exchange:unknown");
  });

  afterEach(() => {
    providerSpy.mockRestore();
    setSystemTime();
  });

  afterAll(async () => {
    await db
      .getOrCreateConnection()
      .deleteFrom("user")
      .where("email", "in", emails)
      .execute();
    await cache.delete("rate-limit:sso-exchange:unknown");
    process.env = originalEnv;
  });

  async function storeState(provider: "google" | "apple") {
    const state = faker.string.uuid();
    await cache.set(
      cacheConstants.ssoState(state),
      { provider, createdAt: Date.now() },
      "600s",
    );
    return state;
  }

  async function googleCallback() {
    const state = await storeState("google");
    const response = await Backend.handle(
      new Request(
        `http://localhost/auth/sso/google/callback?code=provider-code&state=${state}`,
        { method: "GET", redirect: "manual" },
      ),
    );
    return new URL(response.headers.get("location") ?? "");
  }

  async function applePostCallback() {
    const state = await storeState("apple");
    const response = await Backend.handle(
      new Request("http://localhost/auth/sso/apple/callback", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ state, code: "provider-code" }).toString(),
        redirect: "manual",
      }),
    );
    return new URL(response.headers.get("location") ?? "");
  }

  async function exchange(code: string) {
    return Backend.handle(
      new Request("http://localhost/auth/sso/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      }),
    );
  }

  it("redirects a Google sign-in with a single-use code instead of the access token", async () => {
    const location = await googleCallback();

    expect(location.origin + location.pathname).toBe(
      `${FRONTEND_URL}/auth/callback/google`,
    );
    expect(location.searchParams.has("accessToken")).toBe(false);
    expect(location.search).not.toContain("eyJ");
    const code = location.searchParams.get("code") ?? "";
    expect(Buffer.from(code, "base64url").length).toBeGreaterThanOrEqual(16);
  });

  it("redirects an Apple form_post sign-in with a code instead of the access token", async () => {
    const location = await applePostCallback();

    expect(location.pathname).toBe("/auth/callback/apple");
    expect(location.searchParams.has("accessToken")).toBe(false);
    expect(location.searchParams.get("code")).toBeTruthy();
  });

  it("keeps the code in Redis for at most 60 seconds", async () => {
    const code = (await googleCallback()).searchParams.get("code") ?? "";

    const ttl = await cache.ttl(cacheConstants.ssoExchangeCode(code));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("trades the code once for a live session token", async () => {
    const code = (await googleCallback()).searchParams.get("code") ?? "";

    const first = await exchange(code);
    expect(first.status).toBe(200);
    const body = (await first.json()) as {
      accessToken: string;
      verified: boolean;
    };
    expect(body.verified).toBe(true);

    const me = await client.auth.user.get({
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(me.error).toBeFalsy();
    expect(me.data?.id).toBeTruthy();

    const second = await exchange(code);
    expect(second.status).toBe(401);
  });

  it("refuses a code after 60 seconds", async () => {
    const code = (await googleCallback()).searchParams.get("code") ?? "";

    setSystemTime(new Date(Date.now() + 61_000));
    const response = await exchange(code);

    expect(response.status).toBe(401);
  });

  it("refuses a code whose session was signed out before the exchange", async () => {
    const code = (await googleCallback()).searchParams.get("code") ?? "";
    const stored = await cache.get<{ accessToken: string }>(
      cacheConstants.ssoExchangeCode(code),
    );
    const user = await db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("email", "=", emails[emails.length - 1])
      .select("id")
      .executeTakeFirstOrThrow();
    expect(stored?.accessToken).toBeTruthy();
    await cache.delete(cacheConstants.accessToken(user.id));

    const response = await exchange(code);

    expect(response.status).toBe(401);
  });

  it("refuses a code it never issued", async () => {
    const response = await exchange(faker.string.alphanumeric(43));

    expect(response.status).toBe(401);
  });
});
