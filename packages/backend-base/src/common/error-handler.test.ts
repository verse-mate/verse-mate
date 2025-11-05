import { describe, expect, it, mock } from "bun:test";
import { createErrorHandler } from "./error-handler";
import { UnauthorizedError } from "./errors";

describe("createErrorHandler - Rate Limit Detection", () => {
  it("should detect plain objects with status 429 and return proper response", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };
    const mockCache = {
      get: mock(async () => null),
      set: mock(async () => {}),
      ttl: mock(async () => 3600),
    };

    const rateLimitError = {
      status: 429,
      message: "Too many signup attempts, please try again later",
      cacheKey: "rate-limit:signup:127.0.0.1",
    };

    const context = {
      code: "UNKNOWN",
      error: rateLimitError,
      set: mockSet,
      store: { cache: mockCache },
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(429);
    expect(response).toHaveProperty("error", "TOO_MANY_REQUESTS");
    expect(response).toHaveProperty(
      "message",
      "Too many signup attempts, please try again later",
    );
    expect(response).toHaveProperty("retryAfter");
  });

  it("should preserve original rate limit message", async () => {
    const errorHandler = createErrorHandler("auth plugin");
    const mockSet = { status: 200 };
    const mockCache = {
      ttl: mock(async () => 60),
    };

    const rateLimitError = {
      status: 429,
      message: "Too many login attempts, please try again in a minute",
      cacheKey: "rate-limit:login:test@example.com",
    };

    const context = {
      code: "UNKNOWN",
      error: rateLimitError,
      set: mockSet,
      store: { cache: mockCache },
    };

    const response = await errorHandler(context);

    expect(response.message).toBe(
      "Too many login attempts, please try again in a minute",
    );
  });

  it("should calculate retryAfter from cache TTL", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };
    const mockCache = {
      ttl: mock(async () => 1800), // 30 minutes
    };

    const rateLimitError = {
      status: 429,
      message: "Rate limited",
      cacheKey: "rate-limit:test:key",
    };

    const context = {
      code: "UNKNOWN",
      error: rateLimitError,
      set: mockSet,
      store: { cache: mockCache },
    };

    const response = await errorHandler(context);

    expect(mockCache.ttl).toHaveBeenCalledWith("rate-limit:test:key");
    expect(response.retryAfter).toBe(1800);
  });

  it("should handle rate limit errors without cacheKey", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };
    const mockCache = {
      ttl: mock(async () => 60),
    };

    const rateLimitError = {
      status: 429,
      message: "Rate limited",
    };

    const context = {
      code: "UNKNOWN",
      error: rateLimitError,
      set: mockSet,
      store: { cache: mockCache },
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(429);
    expect(response.error).toBe("TOO_MANY_REQUESTS");
    expect(response.message).toBe("Rate limited");
    // retryAfter should be undefined when cacheKey is missing
    expect(response.retryAfter).toBeUndefined();
  });

  it("should still handle ApiError instances correctly", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };

    const apiError = new UnauthorizedError("Not authenticated");

    const context = {
      code: "UNKNOWN",
      error: apiError,
      set: mockSet,
      store: {},
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(401);
    expect(response).toEqual({
      error: "UNAUTHORIZED",
      message: "Not authenticated",
    });
  });

  it("should handle validation errors correctly", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };

    const context = {
      code: "VALIDATION",
      error: new Error("Validation failed"),
      set: mockSet,
      store: {},
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(422);
    expect(response).toEqual({
      error: "VALIDATION_ERROR",
      message: "Invalid request data",
    });
  });

  it("should handle NOT_FOUND errors correctly", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };

    const context = {
      code: "NOT_FOUND",
      error: new Error("Route not found"),
      set: mockSet,
      store: {},
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(404);
    expect(response).toEqual({
      error: "NOT_FOUND",
      message: "Route not found",
    });
  });

  it("should handle generic errors as 500 Internal Server Error", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };

    const genericError = new Error("Something went wrong");

    const context = {
      code: "UNKNOWN",
      error: genericError,
      set: mockSet,
      store: {},
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(500);
    expect(response).toEqual({
      error: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong",
    });
  });
});
