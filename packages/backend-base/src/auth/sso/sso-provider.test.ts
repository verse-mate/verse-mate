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
import { UnauthorizedError, ValidationError } from "../../common/errors";
import { AppleSSOProvider } from "./apple-sso.provider";
import { GoogleSSOProvider } from "./google-sso.provider";
import { SSOProviderFactory, ssoProviderFactory } from "./sso-provider.factory";
import type { SSOTokenPayload } from "./sso-provider.interface";

/**
 * Helper to create a mock JWT token with matching kid header
 */
function createMockJWT(
  payload: Record<string, unknown>,
  kid = "mock-key-id",
): string {
  const header = { alg: "RS256", typ: "JWT", kid };
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
 * Helper to create a mock Google ID token
 */
function createMockGoogleIdToken(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return createMockJWT({
    iss: "https://accounts.google.com",
    azp: "test-client-id",
    aud: "test-client-id",
    sub: "google-user-123",
    email: "test@example.com",
    email_verified: true,
    name: "Test User",
    given_name: "Test",
    family_name: "User",
    iat: now,
    exp: now + 3600,
    ...overrides,
  });
}

/**
 * Helper to create a mock Apple ID token
 */
function createMockAppleIdToken(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return createMockJWT(
    {
      iss: "https://appleid.apple.com",
      aud: "test-apple-client-id",
      sub: "apple-user-456",
      email: "test@privaterelay.appleid.com",
      email_verified: true,
      is_private_email: true,
      iat: now,
      exp: now + 3600,
      ...overrides,
    },
    "mock-key-id",
  );
}

describe("GoogleSSOProvider", () => {
  let provider: GoogleSSOProvider;
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof spyOn>;

  beforeAll(() => {
    // Set required environment variables for Google SSO
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:3001/auth/sso/google/callback";
  });

  beforeEach(() => {
    provider = new GoogleSSOProvider();
    // Mock global fetch
    fetchMock = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("verifyToken - web flow (authorization code exchange)", () => {
    it("should exchange valid authorization code for tokens", async () => {
      const mockIdToken = createMockGoogleIdToken();
      const mockTokenResponse = {
        access_token: "mock-access-token",
        id_token: mockIdToken,
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid email profile",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      } as Response);

      const result = await provider.verifyToken("valid-auth-code", "web");

      expect(result).toBeDefined();
      expect(result.accessToken).toBe("mock-access-token");
      expect(result.idToken).toBe(mockIdToken);
      expect(result.expiresIn).toBe(3600);
      expect(result.claims).toBeDefined();
      expect(result.claims.sub).toBe("google-user-123");
      expect(result.claims.email).toBe("test@example.com");
    });

    it("should throw UnauthorizedError for invalid authorization code", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "invalid_grant" }),
      } as Response);

      await expect(
        provider.verifyToken("invalid-auth-code", "web"),
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("verifyToken - mobile flow (ID token verification)", () => {
    it("should verify valid mobile ID token using tokeninfo endpoint", async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockTokenInfoResponse = {
        iss: "https://accounts.google.com",
        azp: "test-client-id",
        aud: "test-client-id",
        sub: "google-user-123",
        email: "mobile@example.com",
        email_verified: "true",
        name: "Mobile User",
        given_name: "Mobile",
        family_name: "User",
        iat: String(now),
        exp: String(now + 3600),
        alg: "RS256",
        kid: "key-id",
        typ: "JWT",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenInfoResponse,
      } as Response);

      const mockIdToken = createMockGoogleIdToken({
        email: "mobile@example.com",
      });
      const result = await provider.verifyToken(mockIdToken, "mobile");

      expect(result).toBeDefined();
      expect(result.idToken).toBe(mockIdToken);
      expect(result.claims).toBeDefined();
      expect(result.claims.sub).toBe("google-user-123");
      expect(result.claims.email).toBe("mobile@example.com");
    });

    it("should throw UnauthorizedError for expired ID token", async () => {
      const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const mockTokenInfoResponse = {
        iss: "https://accounts.google.com",
        aud: "test-client-id",
        azp: "test-client-id",
        sub: "google-user-123",
        email: "test@example.com",
        email_verified: "true",
        iat: String(expiredTime - 3600),
        exp: String(expiredTime),
        alg: "RS256",
        kid: "key-id",
        typ: "JWT",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenInfoResponse,
      } as Response);

      const expiredToken = createMockGoogleIdToken({ exp: expiredTime });

      await expect(
        provider.verifyToken(expiredToken, "mobile"),
      ).rejects.toThrow(UnauthorizedError);
    });

    it("should throw UnauthorizedError for token with wrong audience", async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockTokenInfoResponse = {
        iss: "https://accounts.google.com",
        azp: "wrong-client-id",
        aud: "wrong-client-id", // Wrong audience
        sub: "google-user-123",
        email: "test@example.com",
        email_verified: "true",
        iat: String(now),
        exp: String(now + 3600),
        alg: "RS256",
        kid: "key-id",
        typ: "JWT",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenInfoResponse,
      } as Response);

      const wrongAudienceToken = createMockGoogleIdToken({
        aud: "wrong-client-id",
      });

      await expect(
        provider.verifyToken(wrongAudienceToken, "mobile"),
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("getUserInfo", () => {
    it("should extract user info from token payload", async () => {
      const tokenPayload: SSOTokenPayload = {
        idToken: "mock-token",
        claims: {
          sub: "google-user-123",
          email: "Test.User@Example.com",
          email_verified: true,
          name: "Test User",
          given_name: "Test",
          family_name: "User",
        },
      };

      const userInfo = await provider.getUserInfo(tokenPayload);

      expect(userInfo.providerUserId).toBe("google-user-123");
      expect(userInfo.email).toBe("test.user@example.com"); // Should be lowercased
      expect(userInfo.emailVerified).toBe(true);
      expect(userInfo.name).toBe("Test User");
      expect(userInfo.firstName).toBe("Test");
      expect(userInfo.lastName).toBe("User");
    });

    it("should throw ValidationError if required claims are missing", async () => {
      const tokenPayload: SSOTokenPayload = {
        idToken: "mock-token",
        claims: {
          // Missing sub and email
          name: "Test User",
        },
      };

      await expect(provider.getUserInfo(tokenPayload)).rejects.toThrow(
        ValidationError,
      );
    });
  });
});

describe("AppleSSOProvider", () => {
  let provider: AppleSSOProvider;
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof spyOn>;

  beforeAll(() => {
    // Set required environment variables for Apple SSO
    // Note: These are test values; in production, real Apple credentials would be used
    process.env.APPLE_CLIENT_ID = "test-apple-client-id";
    process.env.APPLE_TEAM_ID = "TEAMID123";
    process.env.APPLE_KEY_ID = "KEYID456";
    // Use a valid ECDSA P-256 private key for testing (generated for test purposes only)
    process.env.APPLE_PRIVATE_KEY = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEICblWiD4pPKLNM5JCGO6+0ORfPvZwcIFIWxJz7XYVQ9voAcGBSuBBAAK
oUQDQgAE0s5GhmABIZDqxPDLV6N0LhPhXZmNbZNV69+NM5B6C9LBHdJKYhL6nqKG
ZRKqOIZzG+HblXQ0h5b8bLMqkHmXFQ==
-----END EC PRIVATE KEY-----`;
  });

  beforeEach(() => {
    provider = new AppleSSOProvider();
    // Mock global fetch
    fetchMock = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("verifyToken - web flow (authorization code exchange)", () => {
    it("should throw UnauthorizedError for invalid authorization code", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "invalid_grant" }),
      } as Response);

      await expect(
        provider.verifyToken("invalid-apple-auth-code", "web"),
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("verifyToken - mobile flow (ID token verification)", () => {
    it("should verify valid mobile ID token using JWKS", async () => {
      const mockIdToken = createMockAppleIdToken();

      // Mock JWKS endpoint - provide key that matches the mock JWT's kid
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            {
              kty: "RSA",
              kid: "mock-key-id", // Matches the kid in our mock JWT
              use: "sig",
              alg: "RS256",
              n: "mock-n",
              e: "AQAB",
            },
          ],
        }),
      } as Response);

      const result = await provider.verifyToken(mockIdToken, "mobile");

      expect(result).toBeDefined();
      expect(result.idToken).toBe(mockIdToken);
      expect(result.claims).toBeDefined();
      expect(result.claims.sub).toBe("apple-user-456");
      expect(result.claims.email).toBe("test@privaterelay.appleid.com");
    });

    it("should throw UnauthorizedError when JWKS key not found", async () => {
      const mockIdToken = createMockAppleIdToken();

      // Mock JWKS endpoint with no matching key
      fetchMock.mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          keys: [
            {
              kty: "RSA",
              kid: "different-key-id", // Different from the mock JWT's kid
              use: "sig",
              alg: "RS256",
              n: "mock-n",
              e: "AQAB",
            },
          ],
        }),
      }));

      await expect(provider.verifyToken(mockIdToken, "mobile")).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });

  describe("getUserInfo", () => {
    it("should extract user info from Apple token payload", async () => {
      const tokenPayload: SSOTokenPayload = {
        idToken: "mock-apple-token",
        claims: {
          sub: "apple-user-456",
          email: "User@PrivateRelay.AppleID.com",
          email_verified: true,
          is_private_email: true,
        },
      };

      const userInfo = await provider.getUserInfo(tokenPayload);

      expect(userInfo.providerUserId).toBe("apple-user-456");
      expect(userInfo.email).toBe("user@privaterelay.appleid.com"); // Should be lowercased
      expect(userInfo.emailVerified).toBe(true);
      // Apple doesn't provide name in ID token (only in first authorization)
      expect(userInfo.name).toBeUndefined();
      expect(userInfo.firstName).toBeUndefined();
      expect(userInfo.lastName).toBeUndefined();
    });

    it("should handle email_verified as string", async () => {
      const tokenPayload: SSOTokenPayload = {
        idToken: "mock-apple-token",
        claims: {
          sub: "apple-user-456",
          email: "test@example.com",
          email_verified: "true", // String instead of boolean
        },
      };

      const userInfo = await provider.getUserInfo(tokenPayload);

      expect(userInfo.emailVerified).toBe(true);
    });

    it("should throw ValidationError if sub claim is missing", async () => {
      const tokenPayload: SSOTokenPayload = {
        idToken: "mock-apple-token",
        claims: {
          // Missing sub
          email: "test@example.com",
        },
      };

      await expect(provider.getUserInfo(tokenPayload)).rejects.toThrow(
        ValidationError,
      );
    });
  });
});

describe("SSOProviderFactory", () => {
  let factory: SSOProviderFactory;

  beforeEach(() => {
    factory = new SSOProviderFactory();
  });

  describe("getProvider", () => {
    it("should return GoogleSSOProvider for 'google'", () => {
      const provider = factory.getProvider("google");

      expect(provider).toBeDefined();
      expect(provider.name).toBe("google");
      expect(provider).toBeInstanceOf(GoogleSSOProvider);
    });

    it("should return AppleSSOProvider for 'apple'", () => {
      const provider = factory.getProvider("apple");

      expect(provider).toBeDefined();
      expect(provider.name).toBe("apple");
      expect(provider).toBeInstanceOf(AppleSSOProvider);
    });

    it("should throw ValidationError for unsupported provider", () => {
      expect(() => {
        // @ts-expect-error - Testing invalid provider type
        factory.getProvider("facebook");
      }).toThrow(ValidationError);
    });

    it("should cache provider instances", () => {
      const provider1 = factory.getProvider("google");
      const provider2 = factory.getProvider("google");

      expect(provider1).toBe(provider2);
    });
  });

  describe("isSupported", () => {
    it("should return true for supported providers", () => {
      expect(factory.isSupported("google")).toBe(true);
      expect(factory.isSupported("apple")).toBe(true);
    });

    it("should return false for unsupported providers", () => {
      expect(factory.isSupported("facebook")).toBe(false);
      expect(factory.isSupported("microsoft")).toBe(false);
      expect(factory.isSupported("")).toBe(false);
    });
  });

  describe("getSupportedProviders", () => {
    it("should return list of supported providers", () => {
      const providers = factory.getSupportedProviders();

      expect(providers).toContain("google");
      expect(providers).toContain("apple");
      expect(providers).toHaveLength(2);
    });
  });
});

describe("Singleton ssoProviderFactory", () => {
  it("should be a shared instance", () => {
    const google1 = ssoProviderFactory.getProvider("google");
    const google2 = ssoProviderFactory.getProvider("google");

    expect(google1).toBe(google2);
  });
});
