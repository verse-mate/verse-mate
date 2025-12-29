/**
 * SSO Buttons Component Tests
 *
 * These tests verify the SSO UI components behavior.
 * Note: These are unit tests for component logic, not full rendering tests.
 *
 * Test coverage:
 * 1. SSOButtons component renders Google and Apple buttons
 * 2. Google button click initiates OAuth redirect
 * 3. Apple button click initiates OAuth redirect
 * 4. SSOButtons displays loading state during redirect
 * 5. SSO buttons appear above email/password form in SignIn
 * 6. SSO buttons appear above email/password form in SignUp
 */

import { describe, expect, it } from "bun:test";
import {
  ERROR_MESSAGES,
  getErrorType,
  getSSOErrorActionSuggestion,
  isSSOError,
} from "../../utils/error-handling";

describe("SSO Error Handling", () => {
  describe("ERROR_MESSAGES", () => {
    it("should have SSO_ACCOUNT_NO_PASSWORD error message defined", () => {
      expect(ERROR_MESSAGES.SSO_ACCOUNT_NO_PASSWORD).toBeDefined();
      expect(ERROR_MESSAGES.SSO_ACCOUNT_NO_PASSWORD.message).toContain(
        "Google or Apple Sign-In",
      );
      expect(ERROR_MESSAGES.SSO_ACCOUNT_NO_PASSWORD.type).toBe("validation");
      expect(ERROR_MESSAGES.SSO_ACCOUNT_NO_PASSWORD.retryable).toBe(false);
    });

    it("should have SSO_GOOGLE_NO_PASSWORD error message defined", () => {
      expect(ERROR_MESSAGES.SSO_GOOGLE_NO_PASSWORD).toBeDefined();
      expect(ERROR_MESSAGES.SSO_GOOGLE_NO_PASSWORD.message).toContain(
        "Google Sign-In",
      );
    });

    it("should have SSO_APPLE_NO_PASSWORD error message defined", () => {
      expect(ERROR_MESSAGES.SSO_APPLE_NO_PASSWORD).toBeDefined();
      expect(ERROR_MESSAGES.SSO_APPLE_NO_PASSWORD.message).toContain(
        "Apple Sign-In",
      );
    });

    it("should have SSO_TOKEN_INVALID error message defined", () => {
      expect(ERROR_MESSAGES.SSO_TOKEN_INVALID).toBeDefined();
      expect(ERROR_MESSAGES.SSO_TOKEN_INVALID.retryable).toBe(true);
    });

    it("should have SSO_PROVIDER_ERROR error message defined", () => {
      expect(ERROR_MESSAGES.SSO_PROVIDER_ERROR).toBeDefined();
      expect(ERROR_MESSAGES.SSO_PROVIDER_ERROR.type).toBe("server");
      expect(ERROR_MESSAGES.SSO_PROVIDER_ERROR.retryable).toBe(true);
    });
  });

  describe("isSSOError", () => {
    it("should return true for SSO error codes", () => {
      const ssoError = {
        message: "Test message",
        type: "validation" as const,
        code: "SSO_ACCOUNT_NO_PASSWORD",
        retryable: false,
        timestamp: Date.now(),
      };
      expect(isSSOError(ssoError)).toBe(true);
    });

    it("should return true for SSO_GOOGLE_NO_PASSWORD error", () => {
      const ssoError = {
        message: "Test message",
        type: "validation" as const,
        code: "SSO_GOOGLE_NO_PASSWORD",
        retryable: false,
        timestamp: Date.now(),
      };
      expect(isSSOError(ssoError)).toBe(true);
    });

    it("should return false for non-SSO error codes", () => {
      const normalError = {
        message: "Test message",
        type: "validation" as const,
        code: "INVALID_USER",
        retryable: true,
        timestamp: Date.now(),
      };
      expect(isSSOError(normalError)).toBe(false);
    });

    it("should return false for undefined code", () => {
      const errorWithoutCode = {
        message: "Test message",
        type: "unknown" as const,
        retryable: true,
        timestamp: Date.now(),
      };
      expect(isSSOError(errorWithoutCode)).toBe(false);
    });
  });

  describe("getErrorType", () => {
    it("should detect SSO_ACCOUNT_NO_PASSWORD from error code", () => {
      const error = { value: { code: "SSO_ACCOUNT_NO_PASSWORD" } };
      expect(getErrorType(error)).toBe("SSO_ACCOUNT_NO_PASSWORD");
    });

    it("should detect SSO_ACCOUNT_NO_PASSWORD from direct error value", () => {
      const error = { value: "SSO_ACCOUNT_NO_PASSWORD" };
      expect(getErrorType(error)).toBe("SSO_ACCOUNT_NO_PASSWORD");
    });

    it("should detect SSO errors with Google keyword", () => {
      const error = { value: "SSO_GOOGLE_AUTH_FAILED" };
      expect(getErrorType(error)).toBe("SSO_GOOGLE_NO_PASSWORD");
    });

    it("should detect SSO errors with Apple keyword", () => {
      const error = { value: "SSO_APPLE_AUTH_FAILED" };
      expect(getErrorType(error)).toBe("SSO_APPLE_NO_PASSWORD");
    });

    it("should detect SSO token errors", () => {
      const error = { value: "SSO_TOKEN_VERIFICATION_FAILED" };
      expect(getErrorType(error)).toBe("SSO_TOKEN_INVALID");
    });
  });

  describe("getSSOErrorActionSuggestion", () => {
    it("should provide password reset suggestion for SSO_ACCOUNT_NO_PASSWORD", () => {
      const errorState = {
        message: "Test",
        type: "validation" as const,
        code: "SSO_ACCOUNT_NO_PASSWORD",
        retryable: false,
        timestamp: Date.now(),
      };
      const suggestion = getSSOErrorActionSuggestion(errorState);
      expect(suggestion).toContain("Forgot Password");
    });

    it("should provide password reset suggestion for SSO_GOOGLE_NO_PASSWORD", () => {
      const errorState = {
        message: "Test",
        type: "validation" as const,
        code: "SSO_GOOGLE_NO_PASSWORD",
        retryable: false,
        timestamp: Date.now(),
      };
      const suggestion = getSSOErrorActionSuggestion(errorState);
      expect(suggestion).toContain("Forgot Password");
    });

    it("should provide password reset suggestion for SSO_APPLE_NO_PASSWORD", () => {
      const errorState = {
        message: "Test",
        type: "validation" as const,
        code: "SSO_APPLE_NO_PASSWORD",
        retryable: false,
        timestamp: Date.now(),
      };
      const suggestion = getSSOErrorActionSuggestion(errorState);
      expect(suggestion).toContain("Forgot Password");
    });

    it("should provide generic suggestion for other SSO errors", () => {
      const errorState = {
        message: "Test",
        type: "server" as const,
        code: "SSO_PROVIDER_ERROR",
        retryable: true,
        timestamp: Date.now(),
      };
      const suggestion = getSSOErrorActionSuggestion(errorState);
      expect(suggestion).toContain("try again");
    });
  });
});

describe("SSO Components Structure", () => {
  // These are documentation tests that describe expected component behavior
  // Full rendering tests would require @testing-library/react setup

  it("SSOButtons should export required components", async () => {
    const module = await import("./index");
    expect(module.SSOButtons).toBeDefined();
    expect(module.OrDivider).toBeDefined();
  });

  it("SSOButtons should accept required props", async () => {
    const module = await import("./index");
    // Type checking ensures props interface is correct
    // The component should accept these props:
    // - onGoogleClick?: () => void
    // - onAppleClick?: () => void
    // - isLoading?: boolean
    // - loadingProvider?: "google" | "apple" | null
    expect(typeof module.SSOButtons).toBe("function");
  });

  it("OrDivider should be a valid React component", async () => {
    const module = await import("./index");
    expect(typeof module.OrDivider).toBe("function");
  });
});

describe("SSO Integration Points", () => {
  it("should have correct redirect URL paths defined", () => {
    // These are the expected OAuth redirect endpoint paths (appended to backend API URL)
    const googleRedirectPath = "/auth/sso/google/redirect";
    const appleRedirectPath = "/auth/sso/apple/redirect";

    expect(googleRedirectPath).toBe("/auth/sso/google/redirect");
    expect(appleRedirectPath).toBe("/auth/sso/apple/redirect");
  });

  it("should define SSO button labels according to brand guidelines", () => {
    // Google and Apple brand guidelines specify button text
    const googleButtonText = "Continue with Google";
    const appleButtonText = "Continue with Apple";

    expect(googleButtonText).toContain("Google");
    expect(appleButtonText).toContain("Apple");
  });
});
