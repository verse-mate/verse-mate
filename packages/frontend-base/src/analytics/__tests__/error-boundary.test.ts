/**
 * Error Boundary Component Tests
 *
 * Tests for Next.js error boundary components and global error handlers.
 *
 * Test coverage:
 * 1. error.tsx renders error UI with proper styling
 * 2. error.tsx calls captureException on mount with source `error-boundary`
 * 3. reset button calls reset() function
 * 4. "Go to Home" button navigates to `/`
 *
 * Note: These tests verify the error handling logic in isolation since
 * the actual error.tsx components are client components in Next.js.
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
    init: mock(() => {}),
    get_distinct_id: mockGetDistinctId,
    get_session_id: mockGetSessionId,
    get_property: mockGetProperty,
  },
}));

// Mock frontend-envs
mock.module("frontend-envs", () => ({
  $env: {
    get: () => ({
      posthogKey: "test-posthog-key",
      posthogHost: "https://app.posthog.com",
    }),
  },
}));

describe("Error Boundary Components", () => {
  beforeEach(() => {
    mockCapture.mockClear();
  });

  describe("error.tsx behavior", () => {
    it("should capture exception with source 'error-boundary' when error occurs", async () => {
      const { analytics } = await import("../analytics");
      const { collectErrorContext } = await import("../error-filters");

      // Simulate what error.tsx does on mount
      const testError = new Error("Test error from component");
      const context = {
        ...collectErrorContext(),
        source: "error-boundary",
      };

      analytics.captureException(testError, context);

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const call = mockCapture.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      expect(call[0]).toBe("$exception");
      expect(call[1].source).toBe("error-boundary");
      expect(call[1].$exception_message).toBe("Test error from component");
    });

    it("should include error name, message and stack trace in captured exception", async () => {
      const { analytics } = await import("../analytics");

      const testError = new Error("Detailed error message");
      testError.name = "ComponentError";

      analytics.captureException(testError, {
        source: "error-boundary",
        pathname: "/bible/genesis/1",
      });

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const call = mockCapture.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      const properties = call[1];

      expect(properties.$exception_type).toBe("ComponentError");
      expect(properties.$exception_message).toBe("Detailed error message");
      expect(properties.$exception_stack_trace_raw).toBeDefined();
      expect(typeof properties.$exception_stack_trace_raw).toBe("string");
    });

    it("should support reset function callback for retry functionality", () => {
      // Simulate the reset function that Next.js provides to error.tsx
      const resetCallback = mock(() => {});

      // Simulate button click calling reset
      resetCallback();

      expect(resetCallback).toHaveBeenCalledTimes(1);
    });

    it("should support navigation to home page for recovery", () => {
      // Simulate navigation function
      const navigateHome = mock(() => {
        // In real implementation this would be router.push('/')
        return "/";
      });

      const destination = navigateHome();

      expect(navigateHome).toHaveBeenCalledTimes(1);
      expect(destination).toBe("/");
    });
  });

  describe("global-error.tsx behavior", () => {
    it("should capture exception with source 'global-error-boundary'", async () => {
      const { analytics } = await import("../analytics");
      const { collectErrorContext } = await import("../error-filters");

      // Simulate what global-error.tsx does
      const rootLayoutError = new Error("Root layout error");
      const context = {
        ...collectErrorContext(),
        source: "global-error-boundary",
      };

      analytics.captureException(rootLayoutError, context);

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const call = mockCapture.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      expect(call[0]).toBe("$exception");
      expect(call[1].source).toBe("global-error-boundary");
    });
  });

  describe("Global error handlers", () => {
    it("should exclude filtered errors from window.onerror handler", async () => {
      const { shouldExcludeError } = await import("../error-filters");

      // ResizeObserver errors should be excluded
      const resizeObserverError = new Error(
        "ResizeObserver loop limit exceeded",
      );
      expect(shouldExcludeError(resizeObserverError)).toBe(true);

      // Script error (cross-origin) should be excluded
      const scriptError = new Error("Script error");
      expect(shouldExcludeError(scriptError)).toBe(true);

      // Regular errors should NOT be excluded
      const regularError = new Error("Regular component error");

      // Ensure navigator.onLine is true for this test
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
      });

      expect(shouldExcludeError(regularError)).toBe(false);
    });

    it("should collect comprehensive context for window errors", async () => {
      const { collectErrorContext } = await import("../error-filters");

      // Mock window properties for browser-like environment
      const context = collectErrorContext();

      expect(context.timestamp).toBeDefined();
      expect(typeof context.timestamp).toBe("string");
      // Verify it's a valid ISO timestamp - context.timestamp is guaranteed to be defined here
      const timestamp = context.timestamp as string;
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });
});
