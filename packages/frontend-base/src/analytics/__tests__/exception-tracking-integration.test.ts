/**
 * Exception Tracking Integration Tests
 *
 * Strategic tests to verify end-to-end error capture workflows and
 * integration points between components.
 *
 * These tests complement the unit tests from Task Groups 1-3 by focusing on:
 * - Complete context data collection
 * - Multiple error sources producing distinct source tags
 * - End-to-end error capture flow
 * - Error filtering works across all capture points
 *
 * @see Spec: agent-os/specs/2025-12-17-posthog-frontend-exception-tracking/spec.md
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mock posthog-js module with comprehensive mock functions
const mockCapture = mock(() => {});
const mockGetDistinctId = mock(() => "test-distinct-id-123");
const mockGetSessionId = mock(() => "test-session-id-456");
const mockGetProperty = mock((key: string) => {
  if (key === "$user_id") return "test-user-id-789";
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

describe("Exception Tracking Integration", () => {
  beforeEach(() => {
    mockCapture.mockClear();

    // Ensure navigator.onLine is true for tests
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  describe("Complete context data collection", () => {
    it("should collect all context fields (pathname, viewport, user_agent, timestamp, distinct_id, session_id, user_id)", async () => {
      const { collectErrorContext } = await import("../error-filters");

      // Mock window properties for browser-like environment
      // Note: In test environment, some window properties may not be available
      const context = collectErrorContext();

      // Verify timestamp is present and valid
      expect(context.timestamp).toBeDefined();
      expect(typeof context.timestamp).toBe("string");
      const timestamp = context.timestamp as string;
      expect(new Date(timestamp).toISOString()).toBe(timestamp);

      // Verify PostHog identity fields are collected
      expect(context.distinct_id).toBe("test-distinct-id-123");
      expect(context.session_id).toBe("test-session-id-456");
      expect(context.user_id).toBe("test-user-id-789");

      // Verify browser info is attempted (may be undefined in test env)
      // The function should not throw even if window/navigator are limited
      expect(context).toHaveProperty("user_agent");
    });
  });

  describe("Multiple error sources produce distinct source tags", () => {
    it("should capture errors with distinct source tags for each error origin", async () => {
      const { analytics } = await import("../analytics");
      const { collectErrorContext, extractErrorDetails, shouldExcludeError } =
        await import("../error-filters");

      // Simulate error from error-boundary
      const errorBoundaryError = new Error("Component render error");
      analytics.captureException(errorBoundaryError, {
        ...collectErrorContext(),
        source: "error-boundary",
      });

      // Simulate error from global-error-boundary
      const globalError = new Error("Root layout error");
      analytics.captureException(globalError, {
        ...collectErrorContext(),
        source: "global-error-boundary",
      });

      // Simulate error from react-query (following the pattern in useQueryProvider)
      const queryError = new Error("Query failed");
      if (!shouldExcludeError(queryError)) {
        analytics.captureException(queryError, {
          source: "react-query",
          ...extractErrorDetails(queryError),
        });
      }

      // Simulate error from react-query-mutation
      const mutationError = new Error("Mutation failed");
      if (!shouldExcludeError(mutationError)) {
        analytics.captureException(mutationError, {
          source: "react-query-mutation",
          ...extractErrorDetails(mutationError),
        });
      }

      // Simulate error from window-error handler
      const windowError = new Error("Uncaught runtime error");
      if (!shouldExcludeError(windowError)) {
        analytics.captureException(windowError, {
          ...collectErrorContext(),
          source: "window-error",
        });
      }

      // Simulate error from unhandled-promise handler
      const promiseError = new Error("Unhandled promise rejection");
      if (!shouldExcludeError(promiseError)) {
        analytics.captureException(promiseError, {
          ...collectErrorContext(),
          source: "unhandled-promise",
        });
      }

      // Verify all 6 sources were captured
      expect(mockCapture).toHaveBeenCalledTimes(6);

      // Extract all captured source tags
      const capturedSources = (
        mockCapture.mock.calls as unknown as [string, Record<string, unknown>][]
      ).map((call) => call[1].source);

      // Verify all distinct source tags are present
      expect(capturedSources).toContain("error-boundary");
      expect(capturedSources).toContain("global-error-boundary");
      expect(capturedSources).toContain("react-query");
      expect(capturedSources).toContain("react-query-mutation");
      expect(capturedSources).toContain("window-error");
      expect(capturedSources).toContain("unhandled-promise");
    });
  });

  describe("End-to-end error capture flow", () => {
    it("should capture complete exception data with correct PostHog event format", async () => {
      const { analytics } = await import("../analytics");
      const { collectErrorContext } = await import("../error-filters");

      // Create a realistic error with name and stack
      const error = new Error("Failed to load chapter data");
      error.name = "ChapterLoadError";

      // Capture with full context (simulating error.tsx flow)
      const context = {
        ...collectErrorContext(),
        source: "error-boundary",
        pathname: "/bible/genesis/1",
        component_stack: "<ChapterView>\n  <VerseList>",
      };

      analytics.captureException(error, context);

      expect(mockCapture).toHaveBeenCalledTimes(1);

      const call = mockCapture.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];

      // Verify event name is $exception
      expect(call[0]).toBe("$exception");

      const properties = call[1];

      // Verify PostHog standard exception properties
      expect(properties.$exception_type).toBe("ChapterLoadError");
      expect(properties.$exception_message).toBe("Failed to load chapter data");
      expect(properties.$exception_stack_trace_raw).toBeDefined();
      expect(typeof properties.$exception_stack_trace_raw).toBe("string");
      expect(
        (properties.$exception_stack_trace_raw as string).length,
      ).toBeGreaterThan(0);

      // Verify custom context properties
      expect(properties.source).toBe("error-boundary");
      expect(properties.pathname).toBe("/bible/genesis/1");
      expect(properties.component_stack).toBe("<ChapterView>\n  <VerseList>");

      // Verify PostHog identity context
      expect(properties.distinct_id).toBe("test-distinct-id-123");
      expect(properties.session_id).toBe("test-session-id-456");
      expect(properties.user_id).toBe("test-user-id-789");

      // Verify timestamp is present
      expect(properties.timestamp).toBeDefined();
    });
  });

  describe("Error filtering works across all capture points", () => {
    it("should consistently exclude auth errors (401/403) regardless of error structure", async () => {
      const { shouldExcludeError } = await import("../error-filters");

      // Test various 401/403 error structures that might come from different sources
      const errorStructures = [
        // Direct status property
        { status: 401, message: "Unauthorized" },
        { status: 403, message: "Forbidden" },
        // Response.status structure (common in fetch errors)
        { response: { status: 401 }, message: "Unauthorized" },
        { response: { status: 403 }, message: "Forbidden" },
        // Error object with status
        Object.assign(new Error("Unauthorized"), { status: 401 }),
        Object.assign(new Error("Forbidden"), { status: 403 }),
        // Error object with response.status
        Object.assign(new Error("API Error"), { response: { status: 401 } }),
        Object.assign(new Error("API Error"), { response: { status: 403 } }),
      ];

      for (const errorStruct of errorStructures) {
        expect(shouldExcludeError(errorStruct)).toBe(true);
      }

      // Verify non-auth errors are NOT excluded
      const nonAuthErrors = [
        { status: 500, message: "Internal Server Error" },
        { status: 404, message: "Not Found" },
        { response: { status: 422 }, message: "Validation Error" },
        new Error("Regular error"),
      ];

      for (const errorStruct of nonAuthErrors) {
        expect(shouldExcludeError(errorStruct)).toBe(false);
      }
    });

    it("should consistently exclude noise errors from all capture points", async () => {
      const { shouldExcludeError } = await import("../error-filters");

      // ResizeObserver errors (common in React apps)
      expect(
        shouldExcludeError(new Error("ResizeObserver loop limit exceeded")),
      ).toBe(true);
      expect(
        shouldExcludeError(
          new Error(
            "ResizeObserver loop completed with undelivered notifications",
          ),
        ),
      ).toBe(true);

      // Cross-origin script errors (no useful info)
      expect(shouldExcludeError(new Error("Script error"))).toBe(true);
      expect(shouldExcludeError(new Error("Script error."))).toBe(true);

      // AbortError (user navigation/cancellation)
      const abortError = new DOMException("Aborted", "AbortError");
      expect(shouldExcludeError(abortError)).toBe(true);

      // Offline errors
      Object.defineProperty(navigator, "onLine", {
        value: false,
        configurable: true,
      });
      expect(shouldExcludeError(new Error("Network request failed"))).toBe(
        true,
      );

      // Restore online state
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
      });
    });
  });

  describe("API error details extraction for React Query", () => {
    it("should extract complete error details from various API error formats", async () => {
      const { extractErrorDetails } = await import("../error-filters");

      // Eden Treaty / Elysia error format
      const elysiaError = {
        message: "Internal Server Error",
        status: 500,
        response: {
          status: 500,
          url: "https://api.versemate.app/bible/books",
        },
        request: {
          url: "https://api.versemate.app/bible/books",
          method: "GET",
        },
      };

      const details = extractErrorDetails(elysiaError);

      expect(details.status_code).toBe(500);
      expect(details.endpoint).toBe("/bible/books");
      expect(details.method).toBe("GET");
    });
  });
});
