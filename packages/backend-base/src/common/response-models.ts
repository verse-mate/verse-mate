import { t } from "elysia";

/**
 * Standard error response structure used across all API endpoints
 */
export const ErrorResponse = t.Object({
  error: t.String({
    description: "Error type or code",
    examples: ["VALIDATION_ERROR", "UNAUTHORIZED", "NOT_FOUND"],
  }),
  message: t.String({
    description: "Human-readable error message",
  }),
  details: t.Optional(
    t.Any({
      description:
        "Additional error context (validation errors, stack traces, etc.)",
    }),
  ),
});

/**
 * Common error response schemas for reuse across endpoints
 * Use these when ErrorResponse is registered as a model via shared plugin
 */
export const CommonErrorsRef = {
  400: t.Ref("ErrorResponse"),
  401: t.Ref("ErrorResponse"),
  403: t.Ref("ErrorResponse"),
  404: t.Ref("ErrorResponse"),
  422: t.Ref("ErrorResponse"),
  500: t.Ref("ErrorResponse"),
};

/**
 * Standard errors for most endpoints (400, 401, 403, 500)
 * Use these when ErrorResponse is registered as a model via shared plugin
 */
export const StandardErrorsRef = {
  400: t.Ref("ErrorResponse"),
  401: t.Ref("ErrorResponse"),
  403: t.Ref("ErrorResponse"),
  500: t.Ref("ErrorResponse"),
};

/**
 * Errors for authenticated endpoints (401, 403, 500)
 * Use these when ErrorResponse is registered as a model via shared plugin
 */
export const AuthErrorsRef = {
  401: t.Ref("ErrorResponse"),
  403: t.Ref("ErrorResponse"),
  500: t.Ref("ErrorResponse"),
};

/**
 * Common error response schemas - direct schema (no model registration needed)
 */
export const CommonErrors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  422: ErrorResponse,
  500: ErrorResponse,
};

/**
 * Standard errors - direct schema (no model registration needed)
 */
export const StandardErrors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  500: ErrorResponse,
};

/**
 * Auth errors - direct schema (no model registration needed)
 */
export const AuthErrors = {
  401: ErrorResponse,
  403: ErrorResponse,
  500: ErrorResponse,
};

/**
 * Type exports for use in handlers
 */
export type ErrorResponseType = {
  error: string;
  message: string;
  details?: any;
};
