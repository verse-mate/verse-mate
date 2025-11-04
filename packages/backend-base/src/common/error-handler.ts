import { ApiError } from "./errors";

/**
 * Shared error handler for all Elysia plugins
 * Handles ApiError instances and Elysia built-in errors consistently
 *
 * Note: Return type is intentionally loose to work across different plugin contexts
 */
export const createErrorHandler = (pluginName: string) => {
  return async (context: any) => {
    const { code, error, set } = context;
    // Handle custom API errors
    if (error instanceof ApiError) {
      set.status = error.status;
      return error.toResponse();
    }

    // Handle Elysia built-in errors
    switch (code) {
      case "VALIDATION":
        set.status = 422;
        return {
          error: "VALIDATION_ERROR",
          message: "Invalid request data",
        };
      case "NOT_FOUND":
        set.status = 404;
        return {
          error: "NOT_FOUND",
          message: "Route not found",
        };
      default:
        // Detect rate limit errors (plain objects with status: 429)
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 429
        ) {
          set.status = 429;

          // Calculate retryAfter from cache TTL if cacheKey is available
          let retryAfter: number | undefined;
          if ("cacheKey" in error && typeof error.cacheKey === "string") {
            try {
              const cache = context.store?.cache;
              if (cache && typeof cache.ttl === "function") {
                const ttlSeconds = await cache.ttl(error.cacheKey);
                if (ttlSeconds > 0) {
                  retryAfter = ttlSeconds;
                }
              }
            } catch (ttlError) {
              // If TTL query fails, continue without retryAfter
              console.info(
                `Failed to query TTL for rate limit key ${error.cacheKey}:`,
                ttlError,
              );
            }
          }

          // Log rate limit hit at info level
          console.info(
            `Rate limit hit in ${pluginName}: ${error.message}${retryAfter ? ` (retry after ${retryAfter}s)` : ""}`,
          );

          return {
            error: "TOO_MANY_REQUESTS",
            message:
              typeof error.message === "string"
                ? error.message
                : "Too many requests",
            ...(retryAfter !== undefined && { retryAfter }),
          };
        }

        // Handle other unexpected errors
        console.error(`Unhandled error in ${pluginName}:`, error);
        set.status = 500;
        return {
          error: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
        };
    }
  };
};
