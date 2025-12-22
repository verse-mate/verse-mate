/**
 * Error Filters and Context Collection Utilities
 *
 * Provides utilities for filtering out noise errors and collecting comprehensive
 * error context for PostHog exception tracking.
 *
 * @see Spec: agent-os/specs/2025-12-17-posthog-frontend-exception-tracking/spec.md
 */

import posthog from "posthog-js";

/**
 * Context data captured with each exception
 */
export interface ExceptionContext {
  /** Error origin identifier (e.g., 'error-boundary', 'react-query', 'window-error') */
  source?: string;
  /** React component stack trace */
  component_stack?: string;
  /** Current route/URL path */
  pathname?: string;
  /** Previous page URL */
  referrer?: string;
  /** Browser user agent string */
  user_agent?: string;
  /** Screen/viewport dimensions (e.g., "1920x1080") */
  viewport?: string;
  /** ISO timestamp when the error occurred */
  timestamp?: string;
  /** PostHog user ID if authenticated */
  user_id?: string;
  /** PostHog distinct ID for anonymous tracking */
  distinct_id?: string;
  /** PostHog session ID */
  session_id?: string;
  /** HTTP status code if applicable */
  status_code?: number;
  /** API endpoint if applicable */
  endpoint?: string;
  /** HTTP method if applicable */
  method?: string;
  /** Additional custom properties */
  [key: string]: string | number | boolean | undefined;
}

/**
 * Extract HTTP status code from an error object
 *
 * Checks multiple common error structures to find the status code.
 */
function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  const err = error as Record<string, unknown>;

  // Direct status property
  if (typeof err.status === "number") {
    return err.status;
  }

  // Status in response object
  if (err.response && typeof err.response === "object") {
    const response = err.response as Record<string, unknown>;
    if (typeof response.status === "number") {
      return response.status;
    }
  }

  return undefined;
}

/**
 * Get error message from an error object
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    if (typeof err.message === "string") {
      return err.message;
    }
  }
  return String(error);
}

/**
 * Check if error is an AbortError (user cancelled request or navigated away)
 */
function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  return false;
}

/**
 * Check if error is a ResizeObserver loop error
 *
 * These are benign browser errors that occur when ResizeObserver
 * cannot deliver all observations in a single animation frame.
 */
function isResizeObserverError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("resizeobserver loop") ||
    message.includes("resizeobserver loop limit exceeded") ||
    message.includes(
      "resizeobserver loop completed with undelivered notifications",
    )
  );
}

/**
 * Check if error is a cross-origin script error
 *
 * Cross-origin errors only report "Script error" without useful details
 * due to browser security restrictions.
 */
function isCrossOriginError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase().trim();
  return message === "script error" || message === "script error.";
}

/**
 * Check if browser is currently offline
 *
 * Exported for testing purposes - wrap navigator.onLine access
 * to make mocking more reliable across test environments.
 */
export function isOffline(): boolean {
  // Check if navigator exists (may not exist in SSR/non-browser environments)
  if (typeof navigator !== "undefined" && "onLine" in navigator) {
    return !navigator.onLine;
  }
  return false;
}

/**
 * Determine if an error should be excluded from tracking
 *
 * Excludes:
 * - 401/403 HTTP status codes (expected authentication errors)
 * - AbortError (user cancelled request or navigated away)
 * - Errors when browser is offline
 * - ResizeObserver loop errors (benign browser quirk)
 * - Cross-origin errors without useful details
 *
 * @param error - The error to check
 * @returns true if the error should be excluded from tracking
 */
export function shouldExcludeError(error: unknown): boolean {
  // Exclude when offline - network errors are expected
  if (isOffline()) {
    return true;
  }

  // Exclude AbortError (user cancelled request)
  if (isAbortError(error)) {
    return true;
  }

  // Exclude 401/403 HTTP status codes (authentication errors)
  const statusCode = getStatusCode(error);
  if (statusCode === 401 || statusCode === 403) {
    return true;
  }

  // Exclude ResizeObserver loop errors
  if (isResizeObserverError(error)) {
    return true;
  }

  // Exclude cross-origin errors without useful details
  if (isCrossOriginError(error)) {
    return true;
  }

  return false;
}

/**
 * Collect comprehensive error context for PostHog tracking
 *
 * Gathers context data from various sources:
 * - PostHog identity (user_id, distinct_id, session_id)
 * - Browser location (pathname, referrer)
 * - Browser info (user_agent, viewport)
 * - Timestamp
 *
 * @returns Context object with all available data
 */
export function collectErrorContext(): ExceptionContext {
  const context: ExceptionContext = {
    timestamp: new Date().toISOString(),
  };

  // Collect browser location info (if in browser environment)
  if (typeof window !== "undefined") {
    context.pathname = window.location.pathname;
    context.referrer = document.referrer || undefined;
    context.viewport = `${window.innerWidth}x${window.innerHeight}`;
  }

  // Collect browser user agent (if in browser environment)
  if (typeof navigator !== "undefined") {
    context.user_agent = navigator.userAgent;
  }

  // Collect PostHog identity info
  try {
    // Get distinct_id (always available)
    const distinctId = posthog.get_distinct_id?.();
    if (distinctId) {
      context.distinct_id = distinctId;
    }

    // Get session_id
    const sessionId = posthog.get_session_id?.();
    if (sessionId) {
      context.session_id = sessionId;
    }

    // Get user_id if identified
    const userId = posthog.get_property?.("$user_id");
    if (userId && typeof userId === "string") {
      context.user_id = userId;
    }
  } catch {
    // PostHog may not be initialized, ignore errors
  }

  return context;
}

/**
 * Extract error details from API/HTTP errors
 *
 * Attempts to extract status code, URL, endpoint, and method from the error.
 * Following pattern from mobile app's react-query-error-tracking.ts
 *
 * @param error - The error to extract details from
 * @returns Record with extracted details
 */
export function extractErrorDetails(
  error: unknown,
): Record<string, string | number> {
  const details: Record<string, string | number> = {};

  if (!error || typeof error !== "object") {
    return details;
  }

  const err = error as Record<string, unknown>;

  // Extract status code
  const statusCode = getStatusCode(error);
  if (statusCode !== undefined) {
    details.status_code = statusCode;
  }

  // Extract URL/endpoint if available
  if ("url" in err && typeof err.url === "string") {
    try {
      const url = new URL(err.url);
      details.endpoint = url.pathname;
    } catch {
      details.endpoint = err.url;
    }
  }

  // Extract request details if available
  if ("request" in err && err.request && typeof err.request === "object") {
    const request = err.request as Record<string, unknown>;
    if ("url" in request && typeof request.url === "string") {
      try {
        const url = new URL(request.url);
        details.endpoint = url.pathname;
      } catch {
        details.endpoint = request.url;
      }
    }
    if ("method" in request && typeof request.method === "string") {
      details.method = request.method;
    }
  }

  // Extract response details if available
  if ("response" in err && err.response && typeof err.response === "object") {
    const response = err.response as Record<string, unknown>;
    if ("status" in response && typeof response.status === "number") {
      details.status_code = response.status;
    }
    if ("url" in response && typeof response.url === "string") {
      try {
        const url = new URL(response.url);
        details.endpoint = url.pathname;
      } catch {
        details.endpoint = response.url;
      }
    }
  }

  return details;
}
