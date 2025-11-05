import { t } from "elysia";

/**
 * Standard error response schema for API errors
 * Used for 400, 429, and 500 status codes
 */
export const ErrorResponse = t.Object({
  error: t.String(),
  message: t.String(),
  retryAfter: t.Optional(t.Number()),
  data: t.Optional(t.Any()),
});

/**
 * Standard error responses object for spreading into response definitions
 * Provides consistent 400, 429, and 500 error response schemas
 */
export const StandardErrorResponses = {
  400: ErrorResponse,
  429: ErrorResponse,
  500: ErrorResponse,
};

/**
 * Boolean response schema for simple true/false returns
 */
export const BooleanResponse = t.Boolean();

/**
 * Success response schema for operations that return { success: boolean }
 */
export const SuccessResponse = t.Object({
  success: t.Boolean(),
});
