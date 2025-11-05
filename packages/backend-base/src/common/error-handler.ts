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
          (error as any).status === 429
        ) {
          set.status = 429;

          let retryAfter: number | undefined;
          const cacheKey = (error as any).cacheKey;
          if (typeof cacheKey === "string") {
            try {
              const cache = context?.store?.cache;
              if (cache && typeof cache.ttl === "function") {
                const ttlSeconds = await cache.ttl(cacheKey);
                if (typeof ttlSeconds === "number" && ttlSeconds > 0) {
                  // Clamp to a max of 24h to avoid unreasonable values
                  const MAX_RETRY_AFTER = 24 * 60 * 60;
                  retryAfter = Math.min(ttlSeconds, MAX_RETRY_AFTER);
                }
              }
            } catch {
              // swallow TTL errors
            }
          }

          if (process.env.NODE_ENV !== "production") {
            const msg =
              typeof (error as any).message === "string"
                ? (error as any).message
                : "Too many requests";
            console.debug(
              `Rate limit hit in ${pluginName}${retryAfter ? ` (retry after ${retryAfter}s)` : ""}: ${msg}`,
            );
          }

          return {
            error: "TOO_MANY_REQUESTS",
            message:
              typeof (error as any).message === "string"
                ? (error as any).message
                : "Too many requests",
            ...(typeof retryAfter === "number" ? { retryAfter } : {}),
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
