/**
 * React Query Error Tracking Tests
 *
 * Tests for React Query error handling integration with PostHog.
 *
 * Test coverage:
 * 1. QueryCache onError handler captures errors with source `react-query`
 * 2. MutationCache onError handler captures errors with source `react-query-mutation`
 * 3. 401/403 errors are excluded from tracking
 * 4. Error details extraction (status, endpoint, method)
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

import { analytics } from "../analytics";
// Import the utilities we need to test
import { extractErrorDetails, shouldExcludeError } from "../error-filters";

/**
 * Creates query and mutation error handlers matching the implementation
 * in useQueryProvider.tsx for testing purposes
 */
function createQueryErrorHandler() {
  return (error: Error) => {
    if (shouldExcludeError(error)) {
      return;
    }

    const errorDetails = extractErrorDetails(error);
    analytics.captureException(error, {
      source: "react-query",
      ...errorDetails,
    });
  };
}

function createMutationErrorHandler() {
  return (error: Error) => {
    if (shouldExcludeError(error)) {
      return;
    }

    const errorDetails = extractErrorDetails(error);
    analytics.captureException(error, {
      source: "react-query-mutation",
      ...errorDetails,
    });
  };
}

describe("React Query Error Tracking", () => {
  beforeEach(() => {
    mockCapture.mockClear();
    mockPosthogKey = "test-posthog-key";
  });

  describe("QueryCache onError handler", () => {
    it("should capture errors with source 'react-query'", () => {
      const onError = createQueryErrorHandler();
      const error = new Error("Query failed");

      onError(error);

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const call = mockCapture.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      expect(call[0]).toBe("$exception");
      expect(call[1].source).toBe("react-query");
      expect(call[1].$exception_message).toBe("Query failed");
    });

    it("should include error details (status, endpoint, method) from API errors", () => {
      const onError = createQueryErrorHandler();
      const error = Object.assign(new Error("API error"), {
        status: 500,
        request: {
          url: "https://api.example.com/bible/books",
          method: "GET",
        },
      });

      onError(error);

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const call = mockCapture.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      expect(call[1].status_code).toBe(500);
      expect(call[1].endpoint).toBe("/bible/books");
      expect(call[1].method).toBe("GET");
    });
  });

  describe("MutationCache onError handler", () => {
    it("should capture errors with source 'react-query-mutation'", () => {
      const onError = createMutationErrorHandler();
      const error = new Error("Mutation failed");

      onError(error);

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const call = mockCapture.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      expect(call[0]).toBe("$exception");
      expect(call[1].source).toBe("react-query-mutation");
      expect(call[1].$exception_message).toBe("Mutation failed");
    });

    it("should include error details from mutation API errors", () => {
      const onError = createMutationErrorHandler();
      const error = Object.assign(new Error("Failed to save"), {
        response: {
          status: 422,
          url: "https://api.example.com/bookmarks",
        },
      });

      onError(error);

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const call = mockCapture.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      expect(call[1].status_code).toBe(422);
      expect(call[1].endpoint).toBe("/bookmarks");
    });
  });

  describe("Error exclusion for authentication errors", () => {
    it("should NOT capture 401 errors (unauthorized)", () => {
      const onError = createQueryErrorHandler();
      const error = Object.assign(new Error("Unauthorized"), {
        status: 401,
      });

      onError(error);

      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("should NOT capture 403 errors (forbidden)", () => {
      const onError = createQueryErrorHandler();
      const error = Object.assign(new Error("Forbidden"), {
        status: 403,
      });

      onError(error);

      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("should NOT capture 401/403 errors from mutation handler", () => {
      const onError = createMutationErrorHandler();
      const error401 = Object.assign(new Error("Unauthorized"), {
        status: 401,
      });
      const error403 = Object.assign(new Error("Forbidden"), {
        response: { status: 403 },
      });

      onError(error401);
      onError(error403);

      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  describe("extractErrorDetails utility", () => {
    it("should extract status code from error.status", () => {
      const error = { status: 500, message: "Internal Server Error" };
      const details = extractErrorDetails(error);

      expect(details.status_code).toBe(500);
    });

    it("should extract status code from error.response.status", () => {
      const error = {
        message: "Error",
        response: { status: 404 },
      };
      const details = extractErrorDetails(error);

      expect(details.status_code).toBe(404);
    });

    it("should extract endpoint from error.url", () => {
      const error = {
        url: "https://api.example.com/bible/genesis/1",
        message: "Error",
      };
      const details = extractErrorDetails(error);

      expect(details.endpoint).toBe("/bible/genesis/1");
    });

    it("should extract endpoint and method from error.request", () => {
      const error = {
        message: "Error",
        request: {
          url: "https://api.example.com/users/profile",
          method: "POST",
        },
      };
      const details = extractErrorDetails(error);

      expect(details.endpoint).toBe("/users/profile");
      expect(details.method).toBe("POST");
    });

    it("should handle non-URL endpoint paths", () => {
      const error = {
        url: "/relative/path",
        message: "Error",
      };
      const details = extractErrorDetails(error);

      // Non-URL paths should be preserved as-is
      expect(details.endpoint).toBe("/relative/path");
    });

    it("should return empty object for non-object errors", () => {
      expect(extractErrorDetails(null)).toEqual({});
      expect(extractErrorDetails(undefined)).toEqual({});
      expect(extractErrorDetails("string error")).toEqual({});
    });
  });
});
