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
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SSO_ERROR_MESSAGES,
  clearAuthTokens,
  getSSOErrorMessage,
  getSSORedirectDestination,
  handleSSOCallback,
  parseSSOCallbackParams,
  setupPostLoginBehavior,
  storeSSOTokens,
} from "./lib";

// Mock browser APIs for testing
const mockLocalStorage: Record<string, string> = {};
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
    },
  };
}

function clearBrowserMocks() {
  for (const key in mockLocalStorage) {
    delete mockLocalStorage[key];
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

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe("test-access-token");
      expect(result.refreshToken).toBe("test-refresh-token");
      expect(result.verified).toBe(true);
    });

    it("should extract tokens from successful Apple callback URL", () => {
      const params = new URLSearchParams({
        accessToken: "apple-access-token",
        refreshToken: "apple-refresh-token",
        verified: "true",
      });

      const result = parseSSOCallbackParams(params);

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe("apple-access-token");
      expect(result.refreshToken).toBe("apple-refresh-token");
      expect(result.verified).toBe(true);
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

    it("should handle missing refreshToken", () => {
      const params = new URLSearchParams({
        accessToken: "test-token",
        verified: "true",
      });

      const result = parseSSOCallbackParams(params);

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe("test-token");
      expect(result.refreshToken).toBeUndefined();
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
    it("should complete full success flow", () => {
      const params = new URLSearchParams({
        accessToken: "success-token",
        refreshToken: "success-refresh",
        verified: "true",
      });

      const result = handleSSOCallback(params);

      expect(result.success).toBe(true);
      expect(result.redirectUrl).toBe("/");
      // Tokens stored in cookies only (not localStorage for XSS protection)
      expect(mockCookies.some((c) => c.includes("success-token"))).toBe(true);
    });

    it("should preserve original destination from localStorage", () => {
      mockLocalStorage.redirectTo = "/bible?bookId=5&verseId=10";

      const params = new URLSearchParams({
        accessToken: "token",
        verified: "true",
      });

      const result = handleSSOCallback(params);

      expect(result.success).toBe(true);
      expect(result.redirectUrl).toBe("/bible?bookId=5&verseId=10");
    });

    it("should return error details on failure", () => {
      const params = new URLSearchParams({
        error: "access_denied",
        error_description: "User denied",
      });

      const result = handleSSOCallback(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("access_denied");
      expect(result.errorMessage).toBeDefined();
    });

    it("should setup post-login behavior on success", () => {
      const params = new URLSearchParams({
        accessToken: "token",
        verified: "true",
      });

      handleSSOCallback(params);

      expect(mockLocalStorage.postLoginRedirect).toBeDefined();
    });
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
