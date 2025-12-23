"use client";

/**
 * Global Error Boundary
 *
 * Catches errors in the root layout.tsx component.
 * This is a special Next.js error boundary that:
 * - Must include its own <html> and <body> tags (root layout is replaced)
 * - Initializes PostHog directly (provider may not be available)
 * - Provides minimal recovery UI
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling#handling-errors-in-root-layouts
 * @see Spec: agent-os/specs/2025-12-17-posthog-frontend-exception-tracking/spec.md
 */

import posthog from "posthog-js";
import { useEffect, useRef } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const capturedRef = useRef(false);

  // Initialize PostHog directly and capture exception on mount
  useEffect(() => {
    // Prevent double capture in strict mode
    if (capturedRef.current) return;

    // Log error to console
    console.error("Global error boundary caught error:", error);

    // Initialize PostHog directly since the provider may not be available
    // when root layout errors occur
    try {
      const posthogKey =
        process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const posthogHost =
        process.env.POSTHOG_HOST ||
        process.env.NEXT_PUBLIC_POSTHOG_HOST ||
        "https://app.posthog.com";

      if (posthogKey && typeof window !== "undefined") {
        // Check if PostHog is already initialized
        if (!posthog.__loaded) {
          posthog.init(posthogKey, {
            api_host: posthogHost,
            // Minimal config for error capture only
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            disable_session_recording: true,
          });
        }

        // Capture the exception
        posthog.capture("$exception", {
          $exception_type: error.name || "Error",
          $exception_message: error.message || "Unknown error",
          $exception_stack_trace_raw: error.stack || "",
          source: "global-error-boundary",
          pathname: window.location.pathname,
          timestamp: new Date().toISOString(),
          ...(error.digest && { error_digest: error.digest }),
        });

        capturedRef.current = true;
      }
    } catch (captureError) {
      // Fail silently - we don't want error capture to cause more errors
      console.error("Failed to capture global error to PostHog:", captureError);
    }
  }, [error]);

  const handleRefresh = () => {
    // Attempt to recover by refreshing the page
    window.location.reload();
  };

  const handleReset = () => {
    reset();
  };

  return (
    <html lang="en">
      <head>
        <title>Error - VerseMate</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={styles.body}>
        <div style={styles.container}>
          <div style={styles.content}>
            <h1 style={styles.title}>Oops! Something went wrong</h1>

            <p style={styles.message}>
              We encountered an unexpected error. Please try refreshing the
              page.
            </p>

            <div style={styles.buttonContainer}>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleReset}
              >
                Try Again
              </button>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={handleRefresh}
              >
                Refresh Page
              </button>
            </div>

            {/* Development-only debug information */}
            {process.env.NODE_ENV === "development" && (
              <div style={styles.debugContainer}>
                <p style={styles.debugTitle}>
                  Error Details (Development Only):
                </p>
                <pre style={styles.debugText}>
                  {error.name}: {error.message}
                </pre>
                {error.stack && (
                  <>
                    <p style={styles.debugTitle}>Stack Trace:</p>
                    <pre style={styles.debugText}>{error.stack}</pre>
                  </>
                )}
                {error.digest && (
                  <>
                    <p style={styles.debugTitle}>Error Digest:</p>
                    <pre style={styles.debugText}>{error.digest}</pre>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}

/**
 * Inline styles for global error boundary
 * Must be inline since CSS files/modules won't be loaded when root layout fails
 */
const styles: Record<string, React.CSSProperties> = {
  body: {
    margin: 0,
    padding: 0,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  container: {
    minHeight: "100vh",
    backgroundColor: "#000",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
    boxSizing: "border-box",
  },
  content: {
    width: "100%",
    maxWidth: "500px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  title: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#fff",
    margin: "0 0 16px 0",
  },
  message: {
    fontSize: "16px",
    color: "#ccc",
    margin: "0 0 32px 0",
    lineHeight: "24px",
  },
  buttonContainer: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  primaryButton: {
    padding: "16px 32px",
    borderRadius: "8px",
    backgroundColor: "#C19A6B",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
    width: "100%",
  },
  secondaryButton: {
    padding: "16px 32px",
    borderRadius: "8px",
    backgroundColor: "transparent",
    color: "#C19A6B",
    fontSize: "16px",
    fontWeight: "600",
    border: "1px solid #C19A6B",
    cursor: "pointer",
    width: "100%",
  },
  debugContainer: {
    marginTop: "32px",
    padding: "16px",
    backgroundColor: "#1a1a1a",
    borderRadius: "8px",
    maxHeight: "300px",
    width: "100%",
    overflow: "auto",
    textAlign: "left",
    boxSizing: "border-box",
  },
  debugTitle: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#C19A6B",
    margin: "12px 0 8px 0",
  },
  debugText: {
    fontSize: "12px",
    color: "#999",
    fontFamily: "monospace",
    lineHeight: "18px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    margin: 0,
  },
};
