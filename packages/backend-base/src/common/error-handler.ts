import { ApiError } from "./errors";

/**
 * Shared error handler for all Elysia plugins
 * Handles ApiError instances and Elysia built-in errors consistently
 *
 * Note: Return type is intentionally loose to work across different plugin contexts
 */
export const createErrorHandler = (pluginName: string) => {
  return (context: any) => {
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
