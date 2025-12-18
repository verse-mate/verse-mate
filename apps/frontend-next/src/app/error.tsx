"use client";

/**
 * Route-Level Error Boundary
 *
 * Catches errors in route segments and displays a user-friendly error UI
 * with recovery options. Captures exceptions to PostHog for monitoring.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling
 * @see Spec: agent-os/specs/2025-12-17-posthog-frontend-exception-tracking/spec.md
 */

import { analytics, collectErrorContext } from "frontend-base/src/analytics";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorBoundaryProps) {
  const router = useRouter();

  // Capture exception to PostHog on mount
  useEffect(() => {
    // Log error to console in development
    console.error("Error boundary caught error:", error);

    // Capture to PostHog with comprehensive context
    const context = {
      ...collectErrorContext(),
      source: "error-boundary",
      // Include Next.js error digest if available
      ...(error.digest && { error_digest: error.digest }),
    };

    analytics.captureException(error, context);
  }, [error]);

  const handleTryAgain = () => {
    reset();
  };

  const handleGoHome = () => {
    router.push("/");
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.title}>Oops! Something went wrong</h1>

        <p style={styles.message}>
          {error.message || "An unexpected error occurred"}
        </p>

        <div style={styles.buttonContainer}>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={handleTryAgain}
          >
            Try Again
          </button>

          <button
            type="button"
            style={styles.secondaryButton}
            onClick={handleGoHome}
          >
            Go to Home
          </button>
        </div>

        {/* Development-only debug information */}
        {process.env.NODE_ENV === "development" && (
          <div style={styles.debugContainer}>
            <p style={styles.debugTitle}>Error Stack (Development Only):</p>
            <pre style={styles.debugText}>{error.stack}</pre>
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
  );
}

/**
 * Inline styles matching mobile app error boundary design
 * Using inline styles since this is an error boundary that may render
 * before CSS modules are fully loaded
 */
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#000",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
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
    marginBottom: "16px",
    margin: "0 0 16px 0",
  },
  message: {
    fontSize: "16px",
    color: "#ccc",
    marginBottom: "32px",
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
    paddingTop: "16px",
    paddingBottom: "16px",
    paddingLeft: "32px",
    paddingRight: "32px",
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
    paddingTop: "16px",
    paddingBottom: "16px",
    paddingLeft: "32px",
    paddingRight: "32px",
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
  },
  debugTitle: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#C19A6B",
    marginTop: "12px",
    marginBottom: "8px",
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
