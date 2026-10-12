/**
 * SSO Callback Utilities Tests
 *
 * These tests verify the SSO callback handling utilities.
 *
 * Test coverage:
 * 1. Google callback page extracts tokens from URL
 * 2. Apple callback page extracts tokens from URL
 * 3. Callback pages store tokens and redirect to app
 * 4. Callback pages display error for failed SSO
 * 5. Redirect preserves original destination (if any)
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SSO_ERROR_MESSAGES,
  SSO_VERIFIER_KEY,
  clearAuthTokens,
  completeSSOCallback,
  getSSOErrorMessage,
  getSSORedirectDestination,
  handleSSOCallback,
  parseSSOCallbackParams,
  setupPostLoginBehavior,
  startSSOSignIn,
  storeSSOTokens,
} from "./lib";

const rejectExchange = async (): Promise<never> => {
  throw new Error("no code in these callbacks");
};

// Mock browser APIs for testing
const mockLocalStorage: Record<string, string> = {};
const mockSessionStorage: Record<string, string> = {};
const PENDING_VERIFIER = "v".repeat(43);
const ADMIN_ORIGIN = "https://admin.example.test";
const API_URL = "https://api.example.test";

function startedSignIn(secondsAgo = 0) {
  mockSessionStorage[SSO_VERIFIER_KEY] = JSON.stringify({
    verifier: PENDING_VERIFIER,
    startedAt: Date.now() - secondsAgo * 1000,
  });
}

function pendingVerifier(): string {
  return JSON.parse(mockSessionStorage[SSO_VERIFIER_KEY] ?? "{}").verifier;
}
const mockCookies: string[] = [];

// Setup browser environment mocks
function setupBrowserMocks() {
  // Mock localStorage
  (global as any).localStorage = {
    getItem: (key: string) => mockLocalStorage[key] || null,
    setItem: (key: string, value: string) => {
      mockLocalStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockLocalStorage[key];
    },
    clear: () => {
      for (const key in mockLocalStorage) {
        delete mockLocalStorage[key];
      }
    },
  };

  (global as any).sessionStorage = {
    getItem: (key: string) => mockSessionStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockSessionStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockSessionStorage[key];
    },
  };

  // Mock document with cookie property using a proxy
  const documentMock = {
    _cookie: "",
  };

  Object.defineProperty(documentMock, "cookie", {
    get() {
      return mockCookies.join("; ");
    },
    set(value: string) {
      mockCookies.push(value);
    },
    configurable: true,
  });

  (global as any).document = documentMock;

  // Mock window
  (global as any).window = {
    innerWidth: 1920,
    location: {
      href: "",
      origin: ADMIN_ORIGIN,
    },
  };
}

function clearBrowserMocks() {
  for (const key in mockLocalStorage) {
    delete mockLocalStorage[key];
  }
  for (const key in mockSessionStorage) {
    delete mockSessionStorage[key];
  }
  mockCookies.length = 0;
}

describe("SSO Callback Utilities", () => {
  beforeEach(() => {
    setupBrowserMocks();
    clearBrowserMocks();
  });

  afterEach(() => {
    clearBrowserMocks();
  });

  describe("parseSSOCallbackParams", () => {
    it("should extract tokens from successful Google callback URL", () => {
      const params = new URLSearchParams({
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        verified: "true",
      });

      const result = parseSSOCallbackParams(params);

      expect(result).toEqual({
        success: true,
        accessToken: "test-access-token",
        verified: true,
      });
    });

    it("should extract tokens from successful Apple callback URL", () => {
      const params = new URLSearchParams({
        accessToken: "apple-access-token",
        refreshToken: "apple-refresh-token",
        verified: "true",
      });

      const result = parseSSOCallbackParams(params);

      expect(result).toEqual({
        success: true,
        accessToken: "apple-access-token",
        verified: true,
      });
    });

    it("should handle verified=false correctly", () => {
      const params = new URLSearchParams({
        accessToken: "test-token",
        verified: "false",
      });

      const result = parseSSOCallbackParams(params);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(false);
    });

    it("should extract error information from failed callback URL", () => {
      const params = new URLSearchParams({
        error: "access_denied",
        error_description: "User denied access",
      });

      const result = parseSSOCallbackParams(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("access_denied");
      expect(result.errorDescription).toBe("User denied access");
    });

    it("should handle invalid_state error", () => {
      const params = new URLSearchParams({
        error: "invalid_state",
        error_description: "Invalid or expired state parameter",
      });

      const result = parseSSOCallbackParams(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("invalid_state");
    });

    it("should handle missing error description", () => {
      const params = new URLSearchParams({
        error: "auth_failed",
      });

      const result = parseSSOCallbackParams(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("auth_failed");
      expect(result.errorDescription).toBeUndefined();
    });

    it("should parse string input as URLSearchParams", () => {
      const searchString =
        "accessToken=string-token&refreshToken=string-refresh&verified=true";

      const result = parseSSOCallbackParams(searchString);

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe("string-token");
    });

    it("should return unknown_error when no parameters present", () => {
      const params = new URLSearchParams();

      const result = parseSSOCallbackParams(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("unknown_error");
    });
  });

  describe("getSSOErrorMessage", () => {
    it("should return correct message for access_denied", () => {
      const message = getSSOErrorMessage("access_denied");
      expect(message).toContain("denied access");
    });

    it("should return correct message for invalid_state", () => {
      const message = getSSOErrorMessage("invalid_state");
      expect(message).toContain("expired");
    });

    it("should return correct message for user_cancelled_authorize", () => {
      const message = getSSOErrorMessage("user_cancelled_authorize");
      expect(message).toContain("cancelled");
    });

    it("should return user-friendly error description when provided", () => {
      const message = getSSOErrorMessage(
        "unknown_code",
        "A friendly error message",
      );
      expect(message).toBe("A friendly error message");
    });

    it("should not use error description with underscores (technical)", () => {
      const message = getSSOErrorMessage("auth_failed", "technical_error_code");
      expect(message).not.toBe("technical_error_code");
      expect(message).toBe(SSO_ERROR_MESSAGES.auth_failed);
    });

    it("should return default message for unknown error codes", () => {
      const message = getSSOErrorMessage("totally_unknown_error");
      expect(message).toBe(SSO_ERROR_MESSAGES.default);
    });
  });

  describe("storeSSOTokens", () => {
    it("should store access token in cookie only (no localStorage for XSS protection)", () => {
      storeSSOTokens("my-access-token");

      // Token should NOT be in localStorage (XSS mitigation)
      expect(mockLocalStorage.accessToken).toBeUndefined();
      // Token should be in cookie
      expect(mockCookies.some((c) => c.includes("accessToken="))).toBe(true);
      expect(mockCookies.some((c) => c.includes("my-access-token"))).toBe(true);
    });

    it("should store refresh token in cookie when provided", () => {
      storeSSOTokens("access", "my-refresh-token");

      expect(mockCookies.some((c) => c.includes("refreshToken="))).toBe(true);
      expect(mockCookies.some((c) => c.includes("my-refresh-token"))).toBe(
        true,
      );
    });

    it("should not store refresh token when not provided", () => {
      mockCookies.length = 0;
      storeSSOTokens("access-only");

      const refreshCookies = mockCookies.filter((c) =>
        c.includes("refreshToken="),
      );
      expect(refreshCookies.length).toBe(0);
    });
  });

  describe("clearAuthTokens", () => {
    it("should clear all auth tokens from storage", () => {
      // Setup initial tokens
      mockLocalStorage.accessToken = "token-to-clear";
      mockCookies.push("accessToken=token; path=/");
      mockCookies.push("refreshToken=refresh; path=/");

      clearAuthTokens();

      expect(mockLocalStorage.accessToken).toBeUndefined();
      // New delete cookies should be added
      expect(
        mockCookies.some((c) => c.includes("expires=Thu, 01 Jan 1970")),
      ).toBe(true);
    });
  });

  describe("getSSORedirectDestination", () => {
    it("should return saved redirect location and clear it", () => {
      mockLocalStorage.redirectTo = "/bible?bookId=1&verseId=1";

      const destination = getSSORedirectDestination();

      expect(destination).toBe("/bible?bookId=1&verseId=1");
      expect(mockLocalStorage.redirectTo).toBeUndefined();
    });

    it("should return root when no saved redirect", () => {
      const destination = getSSORedirectDestination();
      expect(destination).toBe("/");
    });
  });

  describe("setupPostLoginBehavior", () => {
    it("should set desktop flag for wide screens", () => {
      (global as any).window.innerWidth = 1920;

      setupPostLoginBehavior();

      expect(mockLocalStorage.postLoginRedirect).toBe("desktop");
    });

    it("should set mobile flag for narrow screens", () => {
      (global as any).window.innerWidth = 375;

      setupPostLoginBehavior();

      expect(mockLocalStorage.postLoginRedirect).toBe("mobile");
    });

    it("should treat 1024px as desktop threshold", () => {
      (global as any).window.innerWidth = 1024;

      setupPostLoginBehavior();

      expect(mockLocalStorage.postLoginRedirect).toBe("desktop");
    });

    it("should treat 1023px as mobile", () => {
      (global as any).window.innerWidth = 1023;

      setupPostLoginBehavior();

      expect(mockLocalStorage.postLoginRedirect).toBe("mobile");
    });
  });

  describe("handleSSOCallback", () => {
    it("should complete full success flow", async () => {
      startedSignIn();
      const params = new URLSearchParams({
        accessToken: "success-token",
        refreshToken: "success-refresh",
        verified: "true",
      });

      const result = await handleSSOCallback(params, rejectExchange);

      expect(result.success).toBe(true);
      expect(result.redirectUrl).toBe("/");
      expect(mockCookies.some((c) => c.includes("success-token"))).toBe(true);
    });

    it("should preserve original destination from localStorage", async () => {
      mockLocalStorage.redirectTo = "/bible?bookId=5&verseId=10";
      startedSignIn();

      const params = new URLSearchParams({
        accessToken: "token",
        verified: "true",
      });

      const result = await handleSSOCallback(params, rejectExchange);

      expect(result.success).toBe(true);
      expect(result.redirectUrl).toBe("/bible?bookId=5&verseId=10");
    });

    it("should return error details on failure", async () => {
      const params = new URLSearchParams({
        error: "access_denied",
        error_description: "User denied",
      });

      const result = await handleSSOCallback(params, rejectExchange);

      expect(result.success).toBe(false);
      expect(result.error).toBe("access_denied");
      expect(result.errorMessage).toBeDefined();
    });

    it("should setup post-login behavior on success", async () => {
      startedSignIn();
      const params = new URLSearchParams({
        accessToken: "token",
        verified: "true",
      });

      await handleSSOCallback(params, rejectExchange);

      expect(mockLocalStorage.postLoginRedirect).toBeDefined();
    });
  });
});

describe("SSO callback code exchange", () => {
  beforeEach(() => {
    setupBrowserMocks();
    clearBrowserMocks();
  });

  afterEach(() => {
    clearBrowserMocks();
  });

  it("prefers the single-use code over a token in the address", () => {
    const result = parseSSOCallbackParams(
      new URLSearchParams({ code: "one-time-code", accessToken: "legacy" }),
    );

    expect(result).toEqual({ success: true, code: "one-time-code" });
  });

  it("trades the code and the pending verifier for the session and stores it", async () => {
    const exchanged: string[][] = [];
    mockLocalStorage.redirectTo = "/admin/prompts";
    startedSignIn();

    const result = await handleSSOCallback(
      new URLSearchParams({ code: "one-time-code" }),
      async (code, verifier) => {
        exchanged.push([code, verifier]);
        return { accessToken: "session-token", verified: true };
      },
    );

    expect(exchanged).toEqual([["one-time-code", PENDING_VERIFIER]]);
    expect(mockSessionStorage[SSO_VERIFIER_KEY]).toBeUndefined();
    expect(result).toEqual({ success: true, redirectUrl: "/admin/prompts" });
    expect(mockCookies.some((c) => c.includes("session-token"))).toBe(true);
  });

  it("fails without storing anything when the exchange is refused", async () => {
    startedSignIn();
    const result = await handleSSOCallback(
      new URLSearchParams({ code: "used-code" }),
      async () => {
        throw new Error("Invalid or expired sign-in code");
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("auth_failed");
    expect(mockCookies).toHaveLength(0);
  });

  it("still accepts the token parameter older callbacks send when this tab started sign-in", async () => {
    startedSignIn();
    const result = await handleSSOCallback(
      new URLSearchParams({ accessToken: "legacy-token", verified: "true" }),
      async () => {
        throw new Error("not called");
      },
    );

    expect(result.success).toBe(true);
    expect(mockCookies.some((c) => c.includes("legacy-token"))).toBe(true);
    expect(mockSessionStorage[SSO_VERIFIER_KEY]).toBeUndefined();
  });

  it("refuses a code when this tab never started sign-in, without calling the exchange", async () => {
    let calls = 0;

    const result = await handleSSOCallback(
      new URLSearchParams({ code: "planted-code" }),
      async () => {
        calls++;
        return { accessToken: "attacker-session", verified: true };
      },
    );

    expect(calls).toBe(0);
    expect(result.success).toBe(false);
    expect(result.error).toBe("auth_failed");
    expect(mockCookies).toHaveLength(0);
  });

  it("refuses a token parameter when this tab never started sign-in and stores nothing", async () => {
    const result = await handleSSOCallback(
      new URLSearchParams({ accessToken: "planted-token", verified: "true" }),
      rejectExchange,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("auth_failed");
    expect(mockCookies).toHaveLength(0);
    expect(mockLocalStorage.postLoginRedirect).toBeUndefined();
  });

  it("ignores a refresh token in the callback address", async () => {
    startedSignIn();

    const result = await handleSSOCallback(
      new URLSearchParams({
        accessToken: "legacy-token",
        refreshToken: "planted-refresh",
        verified: "true",
      }),
      rejectExchange,
    );

    expect(result.success).toBe(true);
    expect(mockCookies.some((c) => c.includes("planted-refresh"))).toBe(false);
    expect(
      mockCookies.some((c) => c.startsWith(`${REFRESH_TOKEN_COOKIE}=`)),
    ).toBe(false);
  });

  it("refuses a code when the pending sign-in started more than 600 seconds ago", async () => {
    startedSignIn(601);
    let calls = 0;

    const result = await handleSSOCallback(
      new URLSearchParams({ code: "late-code" }),
      async () => {
        calls++;
        return { accessToken: "late-session", verified: true };
      },
    );

    expect(calls).toBe(0);
    expect(result.success).toBe(false);
    expect(result.error).toBe("auth_failed");
    expect(mockCookies).toHaveLength(0);
    expect(mockSessionStorage[SSO_VERIFIER_KEY]).toBeUndefined();
  });

  it("refuses a token parameter when the pending sign-in started more than 600 seconds ago", async () => {
    startedSignIn(601);

    const result = await handleSSOCallback(
      new URLSearchParams({ accessToken: "late-token", verified: "true" }),
      rejectExchange,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("auth_failed");
    expect(mockCookies).toHaveLength(0);
    expect(mockLocalStorage.postLoginRedirect).toBeUndefined();
  });

  it("accepts a sign-in that started just under 600 seconds ago", async () => {
    startedSignIn(590);

    const result = await handleSSOCallback(
      new URLSearchParams({ code: "timely-code" }),
      async () => ({ accessToken: "timely-session", verified: true }),
    );

    expect(result.success).toBe(true);
  });

  it("refuses a verifier stored in the old plain-text form", async () => {
    mockSessionStorage[SSO_VERIFIER_KEY] = PENDING_VERIFIER;

    const result = await handleSSOCallback(
      new URLSearchParams({ accessToken: "legacy-token", verified: "true" }),
      rejectExchange,
    );

    expect(result.success).toBe(false);
    expect(mockCookies).toHaveLength(0);
  });

  it("removes the pending verifier even when the callback carries an error", async () => {
    startedSignIn();

    await handleSSOCallback(
      new URLSearchParams({ error: "access_denied" }),
      rejectExchange,
    );

    expect(mockSessionStorage[SSO_VERIFIER_KEY]).toBeUndefined();
  });
});

describe("starting SSO sign-in", () => {
  beforeEach(() => {
    setupBrowserMocks();
    clearBrowserMocks();
  });

  afterEach(() => {
    clearBrowserMocks();
  });

  it("keeps a fresh verifier and sends its SHA-256 challenge to the redirect", async () => {
    const before = Date.now();
    await startSSOSignIn(API_URL, "google");

    const stored = JSON.parse(mockSessionStorage[SSO_VERIFIER_KEY]);
    expect(stored.startedAt).toBeGreaterThanOrEqual(before);
    expect(stored.startedAt).toBeLessThanOrEqual(Date.now());
    const verifier = pendingVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expected = createHash("sha256").update(verifier).digest("base64url");
    const target = new URL((global as any).window.location.href);
    expect(target.origin + target.pathname).toBe(
      `${API_URL}/auth/sso/google/redirect`,
    );
    expect(target.searchParams.get("challenge")).toBe(expected);
  });

  for (const provider of ["google", "apple"] as const) {
    it(`asks the ${provider} redirect to come back to this app`, async () => {
      await startSSOSignIn(API_URL, provider);

      const target = new URL((global as any).window.location.href);
      expect(target.origin + target.pathname).toBe(
        `${API_URL}/auth/sso/${provider}/redirect`,
      );
      expect(target.searchParams.get("returnTo")).toBe(ADMIN_ORIGIN);
    });
  }

  it("uses a new verifier for every sign-in", async () => {
    await startSSOSignIn(API_URL, "apple");
    const first = pendingVerifier();
    await startSSOSignIn(API_URL, "apple");

    expect(pendingVerifier()).not.toBe(first);
  });

  for (const provider of ["google", "apple"] as const) {
    it(`sends the browser to the ${provider} error page when the challenge cannot be computed`, async () => {
      const original = globalThis.crypto;
      Object.defineProperty(globalThis, "crypto", {
        value: { getRandomValues: original.getRandomValues.bind(original) },
        configurable: true,
      });
      try {
        await startSSOSignIn(API_URL, provider);
      } finally {
        Object.defineProperty(globalThis, "crypto", {
          value: original,
          configurable: true,
        });
      }

      const target = new URL(
        (global as any).window.location.href,
        "https://app.example.test",
      );
      expect(target.origin).toBe("https://app.example.test");
      expect(target.pathname).toBe(`/auth/callback/${provider}`);
      expect(target.searchParams.get("error")).toBe("invalid_state");
      expect(target.searchParams.get("error_description")).toBe(
        "Sign-in could not start, please try again",
      );
      expect(mockSessionStorage[SSO_VERIFIER_KEY]).toBeUndefined();
    });
  }

  it("sends the browser to the error page when session storage refuses the verifier", async () => {
    (global as any).sessionStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    await startSSOSignIn(API_URL, "google");

    const target = new URL(
      (global as any).window.location.href,
      "https://app.example.test",
    );
    expect(target.pathname).toBe("/auth/callback/google");
    expect(target.searchParams.get("error")).toBe("invalid_state");
  });

  it("shows the start failure on the callback page as a readable message", async () => {
    (global as any).sessionStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    await startSSOSignIn(API_URL, "apple");
    const target = new URL(
      (global as any).window.location.href,
      "https://app.example.test",
    );

    const result = await handleSSOCallback(target.search, rejectExchange);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe(
      "Sign-in could not start, please try again",
    );
  });
});

describe("SSO Error Messages Constants", () => {
  it("should have all expected error codes defined", () => {
    expect(SSO_ERROR_MESSAGES.access_denied).toBeDefined();
    expect(SSO_ERROR_MESSAGES.invalid_state).toBeDefined();
    expect(SSO_ERROR_MESSAGES.missing_code).toBeDefined();
    expect(SSO_ERROR_MESSAGES.auth_failed).toBeDefined();
    expect(SSO_ERROR_MESSAGES.user_cancelled_authorize).toBeDefined();
    expect(SSO_ERROR_MESSAGES.default).toBeDefined();
  });

  it("should have user-friendly messages without technical jargon", () => {
    for (const [_code, message] of Object.entries(SSO_ERROR_MESSAGES)) {
      // Messages should not contain error codes or technical terms
      expect(message).not.toMatch(/[A-Z_]{3,}/);
      // Messages should be reasonably short (under 200 chars)
      expect(message.length).toBeLessThan(200);
    }
  });
});

describe("Token Cookie Constants", () => {
  it("should export correct cookie names", () => {
    expect(ACCESS_TOKEN_COOKIE).toBe("accessToken");
    expect(REFRESH_TOKEN_COOKIE).toBe("refreshToken");
  });
});

describe("completing SSO sign-in on the callback page", () => {
  const steps: string[] = [];

  beforeEach(() => {
    setupBrowserMocks();
    clearBrowserMocks();
    steps.length = 0;
    (global as any).window.location.pathname = "/auth/callback/google";
    (global as any).window.history = {
      state: { page: 1 },
      replaceState: (state: unknown, _unused: string, url: string) => {
        steps.push(`replaceState ${JSON.stringify(state)} ${url}`);
      },
    };
  });

  afterEach(() => {
    clearBrowserMocks();
  });

  it("clears the code from the address bar before it exchanges the code", async () => {
    startedSignIn();
    const exchange = async (code: string) => {
      steps.push(`exchange ${code}`);
      return { accessToken: "header.payload.signature", verified: true };
    };

    const result = await completeSSOCallback("?code=one-time-code", exchange);

    expect(steps).toEqual([
      'replaceState {"page":1} /auth/callback/google',
      "exchange one-time-code",
    ]);
    expect(result.success).toBe(true);
  });

  it("clears the address bar when the provider reports an error too", async () => {
    const result = await completeSSOCallback(
      "?error=access_denied",
      rejectExchange,
    );

    expect(steps).toEqual(['replaceState {"page":1} /auth/callback/google']);
    expect(result.success).toBe(false);
  });
});
