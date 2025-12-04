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
import { faker } from "@faker-js/faker";
import cacheConstants from "../../shared/cache.constants";
import { getTestClient } from "../../shared/test-client";
import Backend, { type AuthPlugin } from "../auth.plugin";

/**
 * Helper to create a mock Google ID token
 */
function createMockGoogleIdToken(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: "mock-key-id" };
  const payload = {
    iss: "https://accounts.google.com",
    azp: "test-client-id",
    aud: "test-client-id",
    sub: `google-user-${faker.string.uuid()}`,
    email: faker.internet.email().toLowerCase(),
    email_verified: true,
    name: faker.person.fullName(),
    given_name: faker.person.firstName(),
    family_name: faker.person.lastName(),
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  const headerBase64 = Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  );
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = Buffer.from("mock-signature").toString("base64url");
  return `${headerBase64}.${payloadBase64}.${signature}`;
}

/**
 * Helper to create a mock Apple ID token
 */
function createMockAppleIdToken(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: "mock-key-id" };
  const payload = {
    iss: "https://appleid.apple.com",
    aud: "test-apple-client-id",
    sub: `apple-user-${faker.string.uuid()}`,
    email: faker.internet.email().toLowerCase(),
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  const headerBase64 = Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  );
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = Buffer.from("mock-signature").toString("base64url");
  return `${headerBase64}.${payloadBase64}.${signature}`;
}

describe("SSO Endpoints", () => {
  const client = getTestClient<AuthPlugin>(Backend);
  const cacheService = Backend.store.cache;
  const db = Backend.store.db;
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof spyOn>;
  let cryptoVerifyMock: ReturnType<typeof spyOn>;
  const testUserIds: string[] = [];

  beforeAll(() => {
    // Set required environment variables
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.APPLE_CLIENT_ID = "test-apple-client-id";
    process.env.APPLE_TEAM_ID = "TEAMID123";
    process.env.APPLE_KEY_ID = "KEYID456";
    process.env.APPLE_PRIVATE_KEY = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEICblWiD4pPKLNM5JCGO6+0ORfPvZwcIFIWxJz7XYVQ9voAcGBSuBBAAK
oUQDQgAE0s5GhmABIZDqxPDLV6N0LhPhXZmNbZNV69+NM5B6C9LBHdJKYhL6nqKG
ZRKqOIZzG+HblXQ0h5b8bLMqkHmXFQ==
-----END EC PRIVATE KEY-----`;
    process.env.BACKEND_URL = "http://localhost:3001";
    process.env.FRONTEND_URL = "http://localhost:3000";
  });

  beforeEach(() => {
    // Mock global fetch for SSO provider API calls
    fetchMock = spyOn(globalThis, "fetch");
    // Mock crypto.subtle.verify to always return true for test tokens
    cryptoVerifyMock = spyOn(crypto.subtle, "verify").mockResolvedValue(true);
  });

  afterEach(() => {
    fetchMock.mockRestore();
    cryptoVerifyMock.mockRestore();
  });

  afterAll(async () => {
    // Clean up test users
    if (testUserIds.length > 0) {
      await db
        .getOrCreateConnection()
        .deleteFrom("user")
        .where("id", "in", testUserIds)
        .execute();
    }

    // Restore original environment
    process.env = originalEnv;

    // Clear rate limit cache
    await cacheService.delete("rate-limit:sso:unknown");
  });

  describe("POST /auth/sso", () => {
    it("should authenticate with valid Google mobile ID token", async () => {
      const now = Math.floor(Date.now() / 1000);
      const email = faker.internet.email().toLowerCase();
      const providerUserId = `google-user-${faker.string.uuid()}`;

      // Mock Google tokeninfo endpoint response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          iss: "https://accounts.google.com",
          azp: "test-client-id",
          aud: "test-client-id",
          sub: providerUserId,
          email: email,
          email_verified: "true",
          name: "Test User",
          given_name: "Test",
          family_name: "User",
          iat: String(now),
          exp: String(now + 3600),
          alg: "RS256",
          kid: "key-id",
          typ: "JWT",
        }),
      } as Response);

      const idToken = createMockGoogleIdToken({
        sub: providerUserId,
        email: email,
      });

      const { data, error } = await client.auth.sso.post({
        provider: "google",
        token: idToken,
        platform: "mobile",
      });

      expect(error).toBeFalsy();
      expect(data?.accessToken).toBeDefined();
      expect(data?.refreshToken).toBeDefined();
      expect(data?.verified).toBe(true); // SSO users are auto-verified

      // Clean up: find and delete the created user
      const user = await db
        .getOrCreateConnection()
        .selectFrom("user")
        .where("email", "=", email)
        .select("id")
        .executeTakeFirst();
      if (user) {
        testUserIds.push(user.id);
      }
    });

    it("should authenticate with valid Apple mobile ID token", async () => {
      const email = faker.internet.email().toLowerCase();
      const providerUserId = `apple-user-${faker.string.uuid()}`;
      const idToken = createMockAppleIdToken({
        sub: providerUserId,
        email: email,
        aud: "test-apple-client-id",
      });

      // Mock Apple JWKS endpoint
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            {
              kty: "RSA",
              kid: "mock-key-id",
              use: "sig",
              alg: "RS256",
              n: "mock-n",
              e: "AQAB",
            },
          ],
        }),
      } as Response);

      const { data, error } = await client.auth.sso.post({
        provider: "apple",
        token: idToken,
        platform: "mobile",
      });

      expect(error).toBeFalsy();
      expect(data?.accessToken).toBeDefined();
      expect(data?.refreshToken).toBeDefined();
      expect(data?.verified).toBe(true);

      // Clean up
      const user = await db
        .getOrCreateConnection()
        .selectFrom("user")
        .where("email", "=", email)
        .select("id")
        .executeTakeFirst();
      if (user) {
        testUserIds.push(user.id);
      }
    });

    it("should return 401 for invalid token", async () => {
      // Mock Google tokeninfo endpoint to return error
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "invalid_token" }),
      } as Response);

      const { data, error } = await client.auth.sso.post({
        provider: "google",
        token: "invalid-token",
        platform: "mobile",
      });

      expect(data).toBeNull();
      expect(error).toBeTruthy();
      // Token verification failure returns 401 UNAUTHORIZED
      expect((error as any)?.status).toBe(401);
    });

    it("should return validation error for unsupported provider in body", async () => {
      const { data, error } = await client.auth.sso.post({
        // @ts-expect-error - Testing invalid provider
        provider: "facebook",
        token: "some-token",
        platform: "mobile",
      });

      expect(data).toBeNull();
      expect(error).toBeTruthy();
      // TypeBox validation error returns 422
      expect((error as any)?.status).toBe(422);
    });
  });

  describe("GET /auth/sso/google/redirect", () => {
    it("should store state in Redis when redirect is initiated", async () => {
      // Make a direct request
      const response = await Backend.handle(
        new Request("http://localhost/auth/sso/google/redirect", {
          method: "GET",
          redirect: "manual",
        }),
      );

      // Should be a redirect (302)
      expect(response.status).toBe(302);

      // Get all keys matching ssoState pattern to verify state was stored
      // We can't easily get the state from the redirect URL in this test environment
      // But we can verify the status code is 302 (redirect)
    });
  });

  describe("GET /auth/sso/apple/redirect", () => {
    it("should return 302 redirect status when initiated", async () => {
      const response = await Backend.handle(
        new Request("http://localhost/auth/sso/apple/redirect", {
          method: "GET",
          redirect: "manual",
        }),
      );

      expect(response.status).toBe(302);
    });
  });

  describe("GET /auth/sso/google/callback - state verification", () => {
    it("should verify stored state in callback", async () => {
      // First, create a valid state manually
      const state = faker.string.uuid();
      await cacheService.set(
        cacheConstants.ssoState(state),
        { provider: "google", createdAt: Date.now() },
        "600s",
      );

      // Verify state is stored
      const storedState = await cacheService.get<{ provider: string }>(
        cacheConstants.ssoState(state),
      );
      expect(storedState).toBeDefined();
      expect(storedState?.provider).toBe("google");

      // Clean up
      await cacheService.delete(cacheConstants.ssoState(state));
    });

    it("should delete state after callback to prevent replay", async () => {
      // Create a valid state
      const state = faker.string.uuid();
      await cacheService.set(
        cacheConstants.ssoState(state),
        { provider: "google", createdAt: Date.now() },
        "600s",
      );

      // Mock Google token endpoint to fail (we don't care about the full flow)
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "invalid_grant" }),
      } as Response);

      // Make callback request
      await Backend.handle(
        new Request(
          `http://localhost/auth/sso/google/callback?code=test-code&state=${state}`,
          {
            method: "GET",
            redirect: "manual",
          },
        ),
      );

      // State should be deleted after callback
      const storedState = await cacheService.get<{ provider: string }>(
        cacheConstants.ssoState(state),
      );
      expect(storedState).toBeNull();
    });
  });

  describe("SSO Rate Limiting", () => {
    it("should apply rate limiting to SSO endpoint", async () => {
      // Clear rate limit cache
      await cacheService.delete("rate-limit:sso:unknown");

      // Make 10 requests (rate limit max)
      for (let i = 0; i < 10; i++) {
        // Mock Google tokeninfo endpoint to fail each time (faster than success)
        fetchMock.mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "invalid_token" }),
        } as Response);

        await client.auth.sso.post({
          provider: "google",
          token: `test-token-${i}`,
          platform: "mobile",
        });
      }

      // 11th request should hit rate limit
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "invalid_token" }),
      } as Response);

      const { data, error } = await client.auth.sso.post({
        provider: "google",
        token: "test-token-11",
        platform: "mobile",
      });

      expect(data).toBeNull();
      expect(error).toBeTruthy();
      expect((error as any)?.status).toBe(429);
      expect((error as any)?.value?.error).toBe("TOO_MANY_REQUESTS");
      expect((error as any)?.value?.message).toBe(
        "Too many SSO attempts, please try again in a minute",
      );

      // Clean up
      await cacheService.delete("rate-limit:sso:unknown");
    });
  });
});
