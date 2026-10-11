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
const ADMIN_URL = "http://localhost:3100";
const EXCHANGE_LIMIT_KEY = "rate-limit:sso-exchange:unknown";
const REDIRECT_LIMIT_KEY = "rate-limit:sso-redirect:unknown";
const VALIDATION_STATUS = 422;

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
    await cache.delete(REDIRECT_LIMIT_KEY);
  });

  afterEach(() => {
    providerSpy.mockRestore();
    setSystemTime();
    Reflect.deleteProperty(process.env, "ADMIN_URL");
  });

  afterAll(async () => {
    await db
      .getOrCreateConnection()
      .deleteFrom("user")
      .where("email", "in", emails)
      .execute();
    await cache.delete(EXCHANGE_LIMIT_KEY);
    await cache.delete(REDIRECT_LIMIT_KEY);
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

  async function startSignIn(
    provider: Provider,
    challenge?: string,
    returnTo?: string,
  ) {
    const params = new URLSearchParams();
    if (challenge !== undefined) params.set("challenge", challenge);
    if (returnTo !== undefined) params.set("returnTo", returnTo);
    const query = params.size > 0 ? `?${params}` : "";
    return Backend.handle(
      new Request(`http://localhost/auth/sso/${provider}/redirect${query}`, {
        method: "GET",
        redirect: "manual",
      }),
    );
  }

  async function googleCallbackFor(state: string) {
    const response = await Backend.handle(
      new Request(
        `http://localhost/auth/sso/google/callback?code=provider-code&state=${state}`,
        { method: "GET", redirect: "manual" },
      ),
    );
    return locationOf(response);
  }

  async function googleCallback(challenge?: string) {
    return googleCallbackFor(await storeState("google", challenge));
  }

  async function appleGetCallback(challenge?: string) {
    const state = await storeState("apple", challenge);
    const response = await Backend.handle(
      new Request(
        `http://localhost/auth/sso/apple/callback?code=provider-code&state=${state}`,
        { method: "GET", redirect: "manual" },
      ),
    );
    return locationOf(response);
  }

  async function applePostCallback(challenge?: string) {
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

    it("limits sign-in starts to 20 a minute per client", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) {
        const response = await startSignIn("google", "short");
        statuses.push(response.status);
      }

      expect(statuses.slice(0, 20).every((status) => status === 302)).toBe(
        true,
      );
      expect(statuses[20]).toBe(429);
    });
  });

  describe("returning to the app that started sign-in", () => {
    async function signInFrom(provider: Provider, returnTo: string) {
      const started = await startSignIn(
        provider,
        challengeOf(newVerifier()),
        returnTo,
      );
      const state = locationOf(started).searchParams.get("state") ?? "";
      if (provider === "google") return googleCallbackFor(state);
      const response = await Backend.handle(
        new Request("http://localhost/auth/sso/apple/callback", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            state,
            code: "provider-code",
          }).toString(),
          redirect: "manual",
        }),
      );
      return locationOf(response);
    }

    for (const provider of ["google", "apple"] as const) {
      it(`sends an admin-started ${provider} sign-in back to the admin app`, async () => {
        process.env.ADMIN_URL = `${ADMIN_URL}/`;

        const location = await signInFrom(provider, ADMIN_URL);

        expect(location.origin + location.pathname).toBe(
          `${ADMIN_URL}/auth/callback/${provider}`,
        );
        expect(location.searchParams.get("code")).toBeTruthy();
      });
    }

    it("sends a sign-in that asks for any other origin to the portal", async () => {
      process.env.ADMIN_URL = ADMIN_URL;

      const location = await signInFrom("google", "https://elsewhere.example");

      expect(location.origin).toBe(FRONTEND_URL);
      expect(location.searchParams.get("code")).toBeTruthy();
    });

    it("sends every sign-in to the portal when ADMIN_URL is unset", async () => {
      const location = await signInFrom("google", ADMIN_URL);

      expect(location.origin).toBe(FRONTEND_URL);
      expect(location.searchParams.get("code")).toBeTruthy();
    });

    it("shows a sign-in that cannot start on the admin app that started it", async () => {
      process.env.ADMIN_URL = ADMIN_URL;

      const response = await startSignIn("apple", undefined, ADMIN_URL);

      const location = locationOf(response);
      expect(location.origin + location.pathname).toBe(
        `${ADMIN_URL}/auth/callback/apple`,
      );
      expect(location.searchParams.get("error")).toBe("invalid_state");
    });
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

    for (const [label, callback] of [
      ["a Google", () => googleCallback()],
      ["an Apple GET", () => appleGetCallback()],
      ["an Apple form_post", () => applePostCallback()],
    ] as const) {
      it(`issues no code for ${label} state started without a challenge`, async () => {
        const location = await callback();

        expect(location.searchParams.has("code")).toBe(false);
        expect(location.searchParams.get("error")).toBe("invalid_state");
        expect(providerSpy).not.toHaveBeenCalled();
      });
    }

    it("mints one code when the same state arrives twice at once", async () => {
      const state = await storeState("google", challengeOf(newVerifier()));

      const locations = await Promise.all([
        googleCallbackFor(state),
        googleCallbackFor(state),
      ]);

      const codes = locations.filter((location) =>
        location.searchParams.has("code"),
      );
      expect(codes).toHaveLength(1);
      expect(providerSpy).toHaveBeenCalledTimes(1);
    });

    it("signs in from the state the redirect route stored through to the exchange", async () => {
      const verifier = newVerifier();
      const started = await startSignIn("google", challengeOf(verifier));
      const state = locationOf(started).searchParams.get("state") ?? "";

      const location = await googleCallbackFor(state);
      const code = location.searchParams.get("code") ?? "";
      const response = await exchange({ code, verifier });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { accessToken: string };
      const me = await client.auth.user.get({
        headers: { authorization: `Bearer ${body.accessToken}` },
      });
      expect(me.data?.id).toBeTruthy();
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
      ["a missing code", { verifier: newVerifier() }],
      [
        "a code of 42 characters",
        { code: faker.string.alphanumeric(42), verifier: newVerifier() },
      ],
      [
        "a code of 44 characters",
        { code: faker.string.alphanumeric(44), verifier: newVerifier() },
      ],
      [
        "a 43-character code with a plus sign",
        { code: `${faker.string.alphanumeric(42)}+`, verifier: newVerifier() },
      ],
      [
        "a 43-character code with a dot",
        { code: `${faker.string.alphanumeric(42)}.`, verifier: newVerifier() },
      ],
    ] as const) {
      it(`rejects ${label} as invalid input before looking the code up`, async () => {
        const response = await exchange(body);

        expect(response.status).not.toBe(401);
        expect(response.status).toBe(VALIDATION_STATUS);
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
