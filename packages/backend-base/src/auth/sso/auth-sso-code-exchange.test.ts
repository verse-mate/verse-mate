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
import { createHash, randomBytes } from "node:crypto";
import { faker } from "@faker-js/faker";
import cacheConstants from "../../shared/cache.constants";
import { getTestClient } from "../../shared/test-client";
import Backend, { type AuthPlugin } from "../auth.plugin";
import { ssoProviderFactory } from "./sso-provider.factory";
import type { SSOProvider } from "./sso-provider.interface";

const FRONTEND_URL = "http://localhost:3000";
const EXCHANGE_LIMIT_KEY = "rate-limit:sso-exchange:unknown";

type Provider = "google" | "apple";

function stubProvider(
  name: Provider,
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

function newVerifier() {
  return randomBytes(32).toString("base64url");
}

function challengeOf(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
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
    process.env.GOOGLE_CLIENT_ID = "placeholder-google-client";
    process.env.APPLE_CLIENT_ID = "placeholder-apple-client";
  });

  beforeEach(async () => {
    const email = faker.internet.email().toLowerCase();
    emails.push(email);
    const providerUserId = faker.string.uuid();
    providerSpy = spyOn(ssoProviderFactory, "getProvider").mockImplementation(
      (name) => stubProvider(name, email, providerUserId),
    );
    await cache.delete(EXCHANGE_LIMIT_KEY);
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
    await cache.delete(EXCHANGE_LIMIT_KEY);
    process.env = originalEnv;
  });

  async function storeState(provider: Provider, challenge?: string) {
    const state = faker.string.uuid();
    await cache.set(
      cacheConstants.ssoState(state),
      challenge
        ? { provider, challenge, createdAt: Date.now() }
        : { provider, createdAt: Date.now() },
      "600s",
    );
    return state;
  }

  function locationOf(response: Response) {
    return new URL(response.headers.get("location") ?? "");
  }

  async function startSignIn(provider: Provider, challenge?: string) {
    const query = challenge === undefined ? "" : `?challenge=${challenge}`;
    return Backend.handle(
      new Request(`http://localhost/auth/sso/${provider}/redirect${query}`, {
        method: "GET",
        redirect: "manual",
      }),
    );
  }

  async function googleCallback(challenge?: string) {
    const state = await storeState("google", challenge);
    const response = await Backend.handle(
      new Request(
        `http://localhost/auth/sso/google/callback?code=provider-code&state=${state}`,
        { method: "GET", redirect: "manual" },
      ),
    );
    return locationOf(response);
  }

  async function appleGetCallback(challenge: string) {
    const state = await storeState("apple", challenge);
    const response = await Backend.handle(
      new Request(
        `http://localhost/auth/sso/apple/callback?code=provider-code&state=${state}`,
        { method: "GET", redirect: "manual" },
      ),
    );
    return locationOf(response);
  }

  async function applePostCallback(challenge: string) {
    const state = await storeState("apple", challenge);
    const response = await Backend.handle(
      new Request("http://localhost/auth/sso/apple/callback", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ state, code: "provider-code" }).toString(),
        redirect: "manual",
      }),
    );
    return locationOf(response);
  }

  async function signedInCode() {
    const verifier = newVerifier();
    const location = await googleCallback(challengeOf(verifier));
    return { code: location.searchParams.get("code") ?? "", verifier };
  }

  async function exchange(body: Record<string, unknown>) {
    return Backend.handle(
      new Request("http://localhost/auth/sso/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  describe("starting sign-in", () => {
    for (const provider of ["google", "apple"] as const) {
      it(`sends a ${provider} sign-in without a challenge back to the app with an error`, async () => {
        const response = await startSignIn(provider);

        expect(response.status).toBe(302);
        const location = locationOf(response);
        expect(location.origin + location.pathname).toBe(
          `${FRONTEND_URL}/auth/callback/${provider}`,
        );
        expect(location.searchParams.get("error")).toBe("invalid_state");
        expect(location.searchParams.get("error_description")).toBe(
          "Sign-in could not start, please try again",
        );
      });
    }

    for (const challenge of [
      "short",
      `${challengeOf(newVerifier())}A`,
      `${challengeOf(newVerifier()).slice(0, 42)}+`,
    ]) {
      it(`sends a malformed challenge (${challenge.length} chars) back to the app with an error`, async () => {
        const response = await startSignIn(
          "google",
          encodeURIComponent(challenge),
        );

        expect(response.status).toBe(302);
        const location = locationOf(response);
        expect(location.pathname).toBe("/auth/callback/google");
        expect(location.searchParams.get("error")).toBe("invalid_state");
      });
    }

    for (const provider of ["google", "apple"] as const) {
      it(`keeps the ${provider} challenge with the state it hands the provider`, async () => {
        const challenge = challengeOf(newVerifier());

        const response = await startSignIn(provider, challenge);

        expect(response.status).toBe(302);
        const state = locationOf(response).searchParams.get("state") ?? "";
        const stored = await cache.get<{
          provider: string;
          challenge: string;
        }>(cacheConstants.ssoState(state));
        await cache.delete(cacheConstants.ssoState(state));
        expect(stored?.provider).toBe(provider);
        expect(stored?.challenge).toBe(challenge);
      });
    }
  });

  describe("provider callbacks", () => {
    it("redirects a Google sign-in with a single-use code instead of the access token", async () => {
      const location = await googleCallback(challengeOf(newVerifier()));

      expect(location.origin + location.pathname).toBe(
        `${FRONTEND_URL}/auth/callback/google`,
      );
      expect(location.searchParams.has("accessToken")).toBe(false);
      expect(location.search).not.toContain("eyJ");
      const code = location.searchParams.get("code") ?? "";
      expect(Buffer.from(code, "base64url").length).toBe(32);
    });

    it("redirects an Apple GET sign-in with a code instead of the access token", async () => {
      const location = await appleGetCallback(challengeOf(newVerifier()));

      expect(location.pathname).toBe("/auth/callback/apple");
      expect(location.searchParams.has("accessToken")).toBe(false);
      expect(location.searchParams.get("error")).toBeNull();
      const code = location.searchParams.get("code") ?? "";
      expect(Buffer.from(code, "base64url").length).toBe(32);
    });

    it("redirects an Apple form_post sign-in with a code instead of the access token", async () => {
      const location = await applePostCallback(challengeOf(newVerifier()));

      expect(location.pathname).toBe("/auth/callback/apple");
      expect(location.searchParams.has("accessToken")).toBe(false);
      expect(location.searchParams.get("code")).toBeTruthy();
    });

    it("issues no code for a state started without a challenge", async () => {
      const location = await googleCallback();

      expect(location.searchParams.has("code")).toBe(false);
      expect(location.searchParams.get("error")).toBe("invalid_state");
      expect(providerSpy).not.toHaveBeenCalled();
    });

    it("keeps the code in Redis for at most 60 seconds", async () => {
      const { code } = await signedInCode();

      const ttl = await cache.ttl(cacheConstants.ssoExchangeCode(code));
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });
  });

  describe("exchanging the code", () => {
    it("trades the code once for a live session token with the matching verifier", async () => {
      const { code, verifier } = await signedInCode();

      const first = await exchange({ code, verifier });
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

      const second = await exchange({ code, verifier });
      expect(second.status).toBe(401);
    });

    it("burns the code when the verifier is wrong", async () => {
      const { code, verifier } = await signedInCode();

      const wrong = await exchange({ code, verifier: newVerifier() });
      expect(wrong.status).toBe(401);
      expect(await wrong.text()).toContain("Invalid or expired sign-in code");

      const right = await exchange({ code, verifier });
      expect(right.status).toBe(401);
    });

    it("gives exactly one session when the same code is exchanged twice at once", async () => {
      const { code, verifier } = await signedInCode();

      const responses = await Promise.all([
        exchange({ code, verifier }),
        exchange({ code, verifier }),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it("refuses a code after 60 seconds", async () => {
      const { code, verifier } = await signedInCode();

      setSystemTime(new Date(Date.now() + 61_000));
      const response = await exchange({ code, verifier });

      expect(response.status).toBe(401);
    });

    it("refuses a code whose session was signed out before the exchange", async () => {
      const { code, verifier } = await signedInCode();
      const user = await db
        .getOrCreateConnection()
        .selectFrom("user")
        .where("email", "=", emails[emails.length - 1])
        .select("id")
        .executeTakeFirstOrThrow();
      await cache.delete(cacheConstants.accessToken(user.id));

      const response = await exchange({ code, verifier });

      expect(response.status).toBe(401);
    });

    it("refuses a code it never issued", async () => {
      const response = await exchange({
        code: faker.string.alphanumeric(43),
        verifier: newVerifier(),
      });

      expect(response.status).toBe(401);
    });

    for (const [label, body] of [
      ["a missing verifier", { code: faker.string.alphanumeric(43) }],
      [
        "a verifier shorter than 43 characters",
        { code: faker.string.alphanumeric(43), verifier: "a".repeat(42) },
      ],
      [
        "a verifier outside the base64url alphabet",
        { code: faker.string.alphanumeric(43), verifier: `${"a".repeat(42)}+` },
      ],
      [
        "a code shorter than 22 characters",
        { code: faker.string.alphanumeric(21), verifier: newVerifier() },
      ],
      [
        "a code longer than 128 characters",
        { code: faker.string.alphanumeric(129), verifier: newVerifier() },
      ],
    ] as const) {
      it(`answers ${label} with a client error`, async () => {
        const response = await exchange(body);

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      });
    }

    it("limits exchanges to 20 a minute per client", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) {
        const response = await exchange({
          code: faker.string.alphanumeric(43),
          verifier: newVerifier(),
        });
        statuses.push(response.status);
      }

      expect(statuses.slice(0, 20).every((status) => status === 401)).toBe(
        true,
      );
      expect(statuses[20]).toBe(429);
    });
  });
});
