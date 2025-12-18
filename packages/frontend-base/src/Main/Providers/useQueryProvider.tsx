"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider as ReactQueryClientProvider,
} from "@tanstack/react-query";
import {
  analytics,
  extractErrorDetails,
  shouldExcludeError,
} from "../../analytics";

/**
 * Create a QueryCache with error tracking
 *
 * Captures query errors to PostHog for monitoring and debugging.
 * Authentication errors (401/403) and other noise errors are filtered out.
 */
const queryCache = new QueryCache({
  onError: (error) => {
    // Filter out noise errors (401/403, AbortError, offline, etc.)
    if (shouldExcludeError(error)) {
      return;
    }

    // Extract error details (status, endpoint, method)
    const errorDetails = extractErrorDetails(error);

    // Capture exception to PostHog with source tag
    analytics.captureException(error, {
      source: "react-query",
      ...errorDetails,
    });
  },
});

/**
 * Create a MutationCache with error tracking
 *
 * Captures mutation errors to PostHog for monitoring and debugging.
 * Authentication errors (401/403) and other noise errors are filtered out.
 */
const mutationCache = new MutationCache({
  onError: (error) => {
    // Filter out noise errors (401/403, AbortError, offline, etc.)
    if (shouldExcludeError(error)) {
      return;
    }

    // Extract error details (status, endpoint, method)
    const errorDetails = extractErrorDetails(error);

    // Capture exception to PostHog with source tag
    analytics.captureException(error, {
      source: "react-query-mutation",
      ...errorDetails,
    });
  },
});

/**
 * QueryClient configured with error tracking
 */
const queryClient = new QueryClient({
  queryCache,
  mutationCache,
});

export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ReactQueryClientProvider client={queryClient}>
      {children}
    </ReactQueryClientProvider>
  );
};
