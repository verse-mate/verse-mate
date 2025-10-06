import type { ErrorResponseType } from "./response-models";

/**
 * Base class for all API errors with HTTP status codes
 */
export abstract class ApiError extends Error {
  abstract status: number;
  abstract code: string;
  details?: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toResponse(): ErrorResponseType {
    return {
      error: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 */
export class UnauthorizedError extends ApiError {
  status = 401;
  code = "UNAUTHORIZED";

  constructor(message = "Authentication required") {
    super(message);
  }
}

/**
 * 403 Forbidden - Authenticated but lacks permissions
 */
export class ForbiddenError extends ApiError {
  status = 403;
  code = "FORBIDDEN";

  constructor(message = "Access forbidden") {
    super(message);
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends ApiError {
  status = 404;
  code = "NOT_FOUND";

  constructor(message = "Resource not found", details?: any) {
    super(message, details);
  }
}

/**
 * 400 Bad Request - Validation or input error
 */
export class ValidationError extends ApiError {
  status = 400;
  code = "VALIDATION_ERROR";

  constructor(message = "Validation failed", details?: any) {
    super(message, details);
  }
}

/**
 * 409 Conflict - Resource conflict (e.g., duplicate email)
 */
export class ConflictError extends ApiError {
  status = 409;
  code = "CONFLICT";

  constructor(message = "Resource conflict", details?: any) {
    super(message, details);
  }
}

/**
 * 500 Internal Server Error - Unexpected server error
 */
export class InternalServerError extends ApiError {
  status = 500;
  code = "INTERNAL_SERVER_ERROR";

  constructor(message = "An unexpected error occurred", details?: any) {
    super(message, details);
  }
}
