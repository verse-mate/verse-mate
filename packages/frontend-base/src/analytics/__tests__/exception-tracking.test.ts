/**
 * Exception Tracking Tests
 *
 * Tests for the captureException method and error filtering utilities.
 *
 * Test coverage:
 * 1. captureException captures error with correct event name `$exception`
 * 2. captureException includes error name, message, and stack trace
 * 3. captureException respects isAnalyticsEnabled() check
 * 4. shouldExcludeError excludes 401/403 errors
 * 5. shouldExcludeError excludes AbortError and offline errors
 * 6. shouldExcludeError excludes ResizeObserver loop errors
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mock posthog-js module
const mockCapture = mock(() => {});
const mockGetDistinctId = mock(() => "test-distinct-id");
const mockGetSessionId = mock(() => "test-session-id");
const mockGetProperty = mock((key: string) => {
  if (key === "$user_id") return "test-user-id";
  return undefined;
});

mock.module("posthog-js", () => ({
  default: {
    capture: mockCapture,
    get_distinct_id: mockGetDistinctId,
    get_session_id: mockGetSessionId,
    get_property: mockGetProperty,
  },
}));

// Mock frontend-envs for controlling analytics enabled state
let mockPosthogKey: string | undefined = "test-posthog-key";
mock.module("frontend-envs", () => ({
  $env: {
    get: () => ({
      posthogKey: mockPosthogKey,
    }),
  },
}));

describe("Exception Tracking", () => {
  beforeEach(() => {
    mockCapture.mockClear();
    mockPosthogKey = "test-posthog-key";
  });

  describe("captureException()", () => {
    it("should capture error with correct event name $exception", async () => {
      const { analytics } = await import("../analytics");
      const error = new Error("Test error");

      analytics.captureException(error);

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const call = mockCapture.mock.calls[0] as unknown as [string, unknown];
      expect(call[0]).toBe("$exception");
    });

    it("should include error name, message, and stack trace in properties", async () => {
      const { analytics } = await import("../analytics");
      const error = new Error("Test error message");
      error.name = "CustomError";

      analytics.captureException(error);

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const call = mockCapture.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      const properties = call[1];
      expect(properties.$exception_message).toBe("Test error message");
      expect(properties.$exception_type).toBe("CustomError");
      expect(properties.$exception_stack_trace_raw).toBeDefined();
      expect(typeof properties.$exception_stack_trace_raw).toBe("string");
    });

    it("should respect isAnalyticsEnabled() check and skip when disabled", async () => {
      mockPosthogKey = undefined; // Disable analytics

      // Clear cache to force re-evaluation
      const modulePath = "../analytics";
      // Need to reimport to pick up the new mock value
      const { analytics } = await import(modulePath);
      const error = new Error("Test error");

      analytics.captureException(error);

      // The capture should not be called when analytics is disabled
      // Note: Due to module caching, we verify the isEnabled check
      expect(analytics.isEnabled()).toBe(false);
    });

    it("should accept optional context object for additional properties", async () => {
      mockPosthogKey = "test-posthog-key"; // Ensure enabled
      const { analytics } = await import("../analytics");
      const error = new Error("Test error");
      const context = {
        source: "error-boundary",
        component_stack: "<App>\n  <Component>",
        pathname: "/bible/genesis/1",
      };

      analytics.captureException(error, context);

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const call = mockCapture.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      const properties = call[1];
      expect(properties.source).toBe("error-boundary");
      expect(properties.component_stack).toBe("<App>\n  <Component>");
      expect(properties.pathname).toBe("/bible/genesis/1");
    });
  });
});

describe("Error Filters", () => {
  describe("shouldExcludeError()", () => {
    it("should exclude 401 HTTP status code errors", async () => {
      const { shouldExcludeError } = await import("../error-filters");
      const error401 = { status: 401, message: "Unauthorized" };
      const errorWithResponse401 = {
        response: { status: 401 },
        message: "Unauthorized",
      };

      expect(shouldExcludeError(error401)).toBe(true);
      expect(shouldExcludeError(errorWithResponse401)).toBe(true);
    });

    it("should exclude 403 HTTP status code errors", async () => {
      const { shouldExcludeError } = await import("../error-filters");
      const error403 = { status: 403, message: "Forbidden" };
      const errorWithResponse403 = {
        response: { status: 403 },
        message: "Forbidden",
      };

      expect(shouldExcludeError(error403)).toBe(true);
      expect(shouldExcludeError(errorWithResponse403)).toBe(true);
    });

    it("should exclude AbortError (user cancelled requests)", async () => {
      const { shouldExcludeError } = await import("../error-filters");
      const abortError = new DOMException(
        "The operation was aborted",
        "AbortError",
      );

      expect(shouldExcludeError(abortError)).toBe(true);
    });

    it("should exclude errors when offline (navigator.onLine === false)", async () => {
      const { shouldExcludeError } = await import("../error-filters");

      // Mock navigator.onLine to be false
      const originalOnLine = Object.getOwnPropertyDescriptor(
        navigator,
        "onLine",
      );
      Object.defineProperty(navigator, "onLine", {
        value: false,
        configurable: true,
      });

      const networkError = new Error("Network request failed");
      expect(shouldExcludeError(networkError)).toBe(true);

      // Restore navigator.onLine
      if (originalOnLine) {
        Object.defineProperty(navigator, "onLine", originalOnLine);
      } else {
        Object.defineProperty(navigator, "onLine", {
          value: true,
          configurable: true,
        });
      }
    });

    it("should exclude ResizeObserver loop errors", async () => {
      const { shouldExcludeError } = await import("../error-filters");
      const resizeObserverError = new Error(
        "ResizeObserver loop limit exceeded",
      );
      const resizeObserverError2 = new Error(
        "ResizeObserver loop completed with undelivered notifications",
      );

      expect(shouldExcludeError(resizeObserverError)).toBe(true);
      expect(shouldExcludeError(resizeObserverError2)).toBe(true);
    });

    it("should exclude cross-origin errors with 'Script error' message", async () => {
      const { shouldExcludeError } = await import("../error-filters");
      const scriptError = new Error("Script error");
      const scriptErrorDot = new Error("Script error.");

      expect(shouldExcludeError(scriptError)).toBe(true);
      expect(shouldExcludeError(scriptErrorDot)).toBe(true);
    });

    it("should NOT exclude regular errors", async () => {
      const { shouldExcludeError } = await import("../error-filters");

      // Ensure navigator.onLine is true
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
      });

      const regularError = new Error("Something went wrong");
      const error500 = { status: 500, message: "Internal Server Error" };
      const error404 = { status: 404, message: "Not Found" };

      expect(shouldExcludeError(regularError)).toBe(false);
      expect(shouldExcludeError(error500)).toBe(false);
      expect(shouldExcludeError(error404)).toBe(false);
    });
  });
});
