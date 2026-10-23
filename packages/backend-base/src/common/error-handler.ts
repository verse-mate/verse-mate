import { ElysiaCustomStatusResponse, NotFoundError } from "elysia";

import { ApiError } from "./errors";

const REQUEST_ERRORS = new Set([
  "PARSE",
  "INVALID_COOKIE_SIGNATURE",
  "INVALID_FILE_TYPE",
]);
const MAX_RETRY_AFTER = 24 * 60 * 60;

type ResponseSet = { status?: number | string };

export function unexpectedErrorResponse(
  source: string,
  error: unknown,
  set: ResponseSet,
) {
  console.error(`Unhandled error in ${source}:`, error);
  set.status = 500;
  return {
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  };
}

export const isRouteNotFound = (error: unknown): boolean =>
  error instanceof NotFoundError;

const statusOf = (error: unknown): unknown =>
  typeof error === "object" && error !== null
    ? (error as { status?: unknown }).status
    : undefined;

function rateLimitResponse(source: string, error: object, set: ResponseSet) {
  set.status = 429;
  const { retryAfter: wait, message: text } = error as {
    retryAfter?: unknown;
    message?: unknown;
  };
  const retryAfter =
    !(error instanceof Error) && typeof wait === "number" && wait > 0
      ? Math.min(wait, MAX_RETRY_AFTER)
      : undefined;
  const message =
    !(error instanceof Error) && typeof text === "string"
      ? text
      : "Too many requests";

  if (process.env.NODE_ENV !== "production") {
    console.debug(
      `Rate limit hit in ${source}${retryAfter ? ` (retry after ${retryAfter}s)` : ""}: ${message}`,
    );
  }

  return {
    error: "TOO_MANY_REQUESTS",
    message,
    ...(typeof retryAfter === "number" ? { retryAfter } : {}),
  };
}

export function answerError(
  source: string,
  code: unknown,
  error: unknown,
  set: ResponseSet,
) {
  if (error instanceof ApiError) {
    if (error.status >= 500) return unexpectedErrorResponse(source, error, set);
    set.status = error.status;
    return error.toResponse();
  }
  if (
    code === "VALIDATION" &&
    (error as { type?: unknown }).type === "response"
  )
    return unexpectedErrorResponse(source, error, set);
  if (code === "VALIDATION") {
    set.status = 422;
    return {
      error: "VALIDATION_ERROR",
      message: "Invalid request data",
    };
  }
  if (REQUEST_ERRORS.has(String(code))) {
    const status = statusOf(error);
    set.status =
      typeof status === "number" && status >= 400 && status < 500
        ? status
        : 400;
    return {
      error: "BAD_REQUEST",
      message: "Invalid request",
    };
  }
  if (statusOf(error) === 429)
    return rateLimitResponse(source, error as object, set);
  if (error instanceof ElysiaCustomStatusResponse || isRouteNotFound(error))
    return undefined;
  return unexpectedErrorResponse(source, error, set);
}

/**
 * Shared error handler for all Elysia plugins
 * Handles ApiError instances and Elysia built-in errors consistently
 *
 * Note: Return type is intentionally loose to work across different plugin contexts
 */
export const createErrorHandler = (pluginName: string) => {
  return async (context: any) => {
    const { code, error, set } = context;
    if (code === "NOT_FOUND" && !(error instanceof ApiError)) {
      set.status = 404;
      return {
        error: "NOT_FOUND",
        message: "Route not found",
      };
    }
    return answerError(pluginName, code, error, set);
  };
};
