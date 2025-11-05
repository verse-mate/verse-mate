import { describe, expect, it } from "bun:test";
import { TooManyRequestsError } from "./errors";

describe("TooManyRequestsError", () => {
  it("should create error with message only", () => {
    const error = new TooManyRequestsError("Too many requests");

    expect(error.message).toBe("Too many requests");
    expect(error.status).toBe(429);
    expect(error.code).toBe("TOO_MANY_REQUESTS");
    expect(error.details).toBeUndefined();
  });

  it("should create error with message and details including retryAfter", () => {
    const error = new TooManyRequestsError("Too many signup attempts", {
      retryAfter: 3600,
    });

    expect(error.message).toBe("Too many signup attempts");
    expect(error.status).toBe(429);
    expect(error.code).toBe("TOO_MANY_REQUESTS");
    expect(error.details).toEqual({ retryAfter: 3600 });
  });

  it("should return correct response format without details", () => {
    const error = new TooManyRequestsError("Rate limit exceeded");
    const response = error.toResponse();

    expect(response).toEqual({
      error: "TOO_MANY_REQUESTS",
      message: "Rate limit exceeded",
    });
  });

  it("should return correct response format with details", () => {
    const error = new TooManyRequestsError("Too many login attempts", {
      retryAfter: 60,
    });
    const response = error.toResponse();

    expect(response).toEqual({
      error: "TOO_MANY_REQUESTS",
      message: "Too many login attempts",
      details: { retryAfter: 60 },
    });
  });

  it("should have correct instance type", () => {
    const error = new TooManyRequestsError("Test message");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect(error.name).toBe("TooManyRequestsError");
  });
});
