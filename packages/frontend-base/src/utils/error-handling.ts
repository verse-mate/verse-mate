/**
 * Enhanced error handling utilities for VerseMate frontend
 * Based on project memory for comprehensive error extraction patterns
 */

export interface ErrorState {
  message: string;
  type: ErrorType;
  code?: string;
  retryable: boolean;
  timestamp: number;
}

export type ErrorType = "validation" | "network" | "server" | "unknown";

export interface ErrorMessageConfig {
  message: string;
  type: ErrorType;
  retryable: boolean;
}

/**
 * Comprehensive error message mapping based on different error scenarios
 */
export const ERROR_MESSAGES: Record<string, ErrorMessageConfig> = {
  // Authentication specific errors
  INVALID_USER: {
    message:
      "The email and password you entered don't match our records. Please check your credentials and try again.",
    type: "validation",
    retryable: true,
  },
  USER_NOT_FOUND: {
    message:
      "No account found with this email address. Please check your email or create a new account.",
    type: "validation",
    retryable: true,
  },
  EMAIL_ALREADY_EXISTS: {
    message:
      "An account with this email already exists. Please try logging in instead.",
    type: "validation",
    retryable: false,
  },
  ALREADY_EXISTS: {
    message:
      "An account with this email already exists. Please try logging in instead.",
    type: "validation",
    retryable: false,
  },
  INACTIVATED_USER: {
    message:
      "Your account has been deactivated. Please contact support for assistance.",
    type: "validation",
    retryable: false,
  },

  // SSO-specific errors
  SSO_ACCOUNT_NO_PASSWORD: {
    message:
      "This account uses Google or Apple Sign-In. Please use that method to log in, or use 'Forgot Password' to set up a password.",
    type: "validation",
    retryable: false,
  },
  SSO_GOOGLE_NO_PASSWORD: {
    message:
      "This account uses Google Sign-In. Please use that method to log in, or use 'Forgot Password' to set up a password.",
    type: "validation",
    retryable: false,
  },
  SSO_APPLE_NO_PASSWORD: {
    message:
      "This account uses Apple Sign-In. Please use that method to log in, or use 'Forgot Password' to set up a password.",
    type: "validation",
    retryable: false,
  },
  SSO_TOKEN_INVALID: {
    message: "Sign-in verification failed. Please try again.",
    type: "validation",
    retryable: true,
  },
  SSO_TOKEN_EXPIRED: {
    message: "Your sign-in session has expired. Please try again.",
    type: "validation",
    retryable: true,
  },
  SSO_EMAIL_NOT_VERIFIED: {
    message:
      "Your email address is not verified with this provider. Please verify your email and try again.",
    type: "validation",
    retryable: false,
  },
  SSO_PROVIDER_ERROR: {
    message:
      "There was a problem connecting to the sign-in provider. Please try again later.",
    type: "server",
    retryable: true,
  },

  // Network and connectivity errors
  NETWORK_ERROR: {
    message:
      "Unable to connect to our servers. Please check your internet connection and try again.",
    type: "network",
    retryable: true,
  },
  CONNECTION_TIMEOUT: {
    message:
      "The request timed out. Please check your connection and try again.",
    type: "network",
    retryable: true,
  },
  DNS_ERROR: {
    message:
      "Unable to reach our servers. Please check your internet connection.",
    type: "network",
    retryable: true,
  },

  // Server errors
  SERVER_ERROR: {
    message:
      "Our servers are temporarily unavailable. Please try again in a few moments.",
    type: "server",
    retryable: true,
  },
  INTERNAL_SERVER_ERROR: {
    message: "An internal server error occurred. Please try again later.",
    type: "server",
    retryable: true,
  },
  SERVICE_UNAVAILABLE: {
    message:
      "Service is temporarily unavailable. Please try again in a few moments.",
    type: "server",
    retryable: true,
  },
  BAD_GATEWAY: {
    message: "Server communication error. Please try again later.",
    type: "server",
    retryable: true,
  },

  // Fallback error
  UNKNOWN_ERROR: {
    message:
      "Something unexpected happened. Please try again or contact support if the problem persists.",
    type: "unknown",
    retryable: true,
  },
};

/**
 * Enhanced error extraction function that checks multiple nested error structures
 * Based on project memory specifications for Eden API client error handling
 */
export function extractErrorMessage(error: any): string | null {
  // Safety check for null or undefined error
  if (!error || (typeof error !== "object" && typeof error !== "string")) {
    return null;
  }

  // If error is already a string, return it
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  // Check various error structure patterns as specified in project memory
  const errorChecks = [
    // Handle nested object values FIRST (most specific)
    error?.value?.message,
    error?.value?.error,
    error?.value?.code,
    error?.error?.value?.message,
    error?.error?.value?.error,
    error?.response?.body?.value?.message,
    error?.response?.body?.value?.error,
    error?.response?.body?.error?.value,
    error?.response?.body?.error?.message,
    error?.response?.body?.message,

    // Direct string values (less specific, checked after nested)
    error?.message,
    error?.error?.value,
    error?.error?.message,

    // error.value should be LAST since it might be an object
    error?.value,
  ];

  for (const check of errorChecks) {
    if (typeof check === "string" && check.trim()) {
      return check.trim();
    }
  }

  return null;
}

/**
 * Determine error type based on error structure and HTTP status codes
 */
export function getErrorType(error: any): string {
  // First, try to extract the error code/value
  const errorCode = extractErrorMessage(error);

  // Prioritize specific error codes from API response over HTTP status codes
  if (errorCode && ERROR_MESSAGES[errorCode]) {
    return errorCode;
  }

  // If we have an error code but no mapping, check if it matches common patterns
  if (errorCode && typeof errorCode === "string") {
    const upperErrorCode = errorCode.toUpperCase();

    // Check for SSO-specific error patterns
    if (upperErrorCode.includes("SSO_ACCOUNT_NO_PASSWORD")) {
      return "SSO_ACCOUNT_NO_PASSWORD";
    }
    if (upperErrorCode.includes("SSO") && upperErrorCode.includes("GOOGLE")) {
      return "SSO_GOOGLE_NO_PASSWORD";
    }
    if (upperErrorCode.includes("SSO") && upperErrorCode.includes("APPLE")) {
      return "SSO_APPLE_NO_PASSWORD";
    }
    if (upperErrorCode.includes("SSO") && upperErrorCode.includes("TOKEN")) {
      return "SSO_TOKEN_INVALID";
    }

    // Check for common error patterns
    if (
      upperErrorCode.includes("INVALID") ||
      upperErrorCode.includes("WRONG")
    ) {
      return "INVALID_USER";
    }
    if (
      upperErrorCode.includes("NOT_FOUND") ||
      upperErrorCode.includes("USER_NOT_FOUND")
    ) {
      return "USER_NOT_FOUND";
    }
    if (
      upperErrorCode.includes("EXISTS") ||
      upperErrorCode.includes("ALREADY")
    ) {
      return "ALREADY_EXISTS";
    }
  }

  // If error code extraction failed but we have a 500 status, it's likely a server error
  const status = error?.response?.status || error?.status;
  if (status === 500 && !errorCode) {
    // For 500 errors without clear error codes, assume it's a validation issue if it's an auth endpoint
    // This is a fallback for cases where the backend returns 500 for validation errors
    return "INVALID_USER";
  }

  // Network error detection (check before HTTP status codes)
  if (
    error?.name === "NetworkError" ||
    error?.code === "NETWORK_ERROR" ||
    error?.message?.includes("fetch")
  ) {
    return "NETWORK_ERROR";
  }

  // Timeout detection
  if (
    error?.name === "TimeoutError" ||
    error?.code === "TIMEOUT" ||
    error?.message?.includes("timeout")
  ) {
    return "CONNECTION_TIMEOUT";
  }

  // HTTP status code based detection (as fallback)
  if (typeof status === "number") {
    if (status === 401 || status === 403) return "INVALID_USER";
    if (status === 404) return "USER_NOT_FOUND";
    if (status === 409) return "ALREADY_EXISTS";
    if (status === 502) return "BAD_GATEWAY";
    if (status === 503) return "SERVICE_UNAVAILABLE";
    if (status >= 500) return "SERVER_ERROR";
  }

  return "UNKNOWN_ERROR";
}

/**
 * Create a comprehensive error state object
 */
export function createErrorState(error: any): ErrorState {
  const errorType = getErrorType(error);
  const config = ERROR_MESSAGES[errorType] || ERROR_MESSAGES.UNKNOWN_ERROR;

  return {
    message: config.message,
    type: config.type,
    code: errorType,
    retryable: config.retryable,
    timestamp: Date.now(),
  };
}

/**
 * Debug function to log unhandled error structures for continuous improvement
 * Based on project memory specifications
 */
export function debugUnhandledError(error: any, context = "Unknown"): void {
  if (process.env.NODE_ENV === "development") {
    const errorCode = extractErrorMessage(error);

    if (!errorCode || !ERROR_MESSAGES[errorCode]) {
      console.group(`Unhandled Error Structure - ${context}`);
      console.log("Error object:", error);
      console.log("Extracted code:", errorCode);
      console.log("Error type:", typeof error);
      console.log(
        "Error keys:",
        error && typeof error === "object" ? Object.keys(error) : "N/A",
      );

      // Enhanced debugging for nested structures
      if (error?.value && typeof error.value === "object") {
        console.log("Error.value object:", error.value);
        console.log("Error.value keys:", Object.keys(error.value));
      }

      if (error?.response) {
        console.log("Response status:", error.response.status);
        console.log("Response body:", error.response.body);
      }

      console.groupEnd();
    }
  }
}

/**
 * Main error processing function that combines extraction, mapping, and debugging
 */
export function processError(error: any, context = "API"): ErrorState {
  // Add debugging for unhandled structures
  debugUnhandledError(error, context);

  // Create and return the error state
  return createErrorState(error);
}

/**
 * Check if an error is retryable based on its type and configuration
 */
export function isRetryableError(errorState: ErrorState): boolean {
  return (
    errorState.retryable &&
    (errorState.type === "network" || errorState.type === "server")
  );
}

/**
 * Get user-friendly action suggestions based on error type
 */
export function getErrorActionSuggestion(errorState: ErrorState): string {
  switch (errorState.type) {
    case "validation":
      return "Please check your input and try again.";
    case "network":
      return "Check your internet connection and try again.";
    case "server":
      return "Please wait a moment and try again.";
    default:
      return "Please try again or contact support if the issue persists.";
  }
}

/**
 * Safe helper to get error message from any error object
 * Provides fallback for unknown error structures
 */
export function getErrorMessage(error: any): string {
  if (!error) {
    return "An unexpected error occurred.";
  }

  // If it's already an ErrorState, use it directly
  if (error.message && typeof error.message === "string") {
    return error.message;
  }

  // Try to extract message using our enhanced extraction
  const extractedMessage = extractErrorMessage(error);
  if (extractedMessage) {
    return extractedMessage;
  }

  // Fallback for completely unknown structures
  return String(error) || "An unexpected error occurred.";
}

/**
 * Check if an error is an SSO-related error
 */
export function isSSOError(errorState: ErrorState): boolean {
  return errorState.code?.startsWith("SSO_") ?? false;
}

/**
 * Get SSO-specific action suggestion
 */
export function getSSOErrorActionSuggestion(errorState: ErrorState): string {
  if (
    errorState.code === "SSO_ACCOUNT_NO_PASSWORD" ||
    errorState.code === "SSO_GOOGLE_NO_PASSWORD" ||
    errorState.code === "SSO_APPLE_NO_PASSWORD"
  ) {
    return "You can also use 'Forgot Password' to set up a password for email login.";
  }
  return getErrorActionSuggestion(errorState);
}
