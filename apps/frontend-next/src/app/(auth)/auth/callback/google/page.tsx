"use client";

import {
  getSSOErrorMessage,
  handleSSOCallback,
} from "frontend-base/src/auth/lib";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Loading spinner component for the callback page
 */
function LoadingSpinner() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          border: "3px solid var(--gray, #888)",
          borderTopColor: "var(--white, #fff)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <p style={{ color: "var(--gray, #888)", fontSize: "14px" }}>
        Completing sign-in...
      </p>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

/**
 * Error display component for failed SSO
 */
function ErrorDisplay({
  errorMessage,
  onRetry,
}: {
  errorMessage: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        maxWidth: "400px",
        textAlign: "center",
      }}
    >
      {/* Error Icon */}
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "#ef4444" }}
          role="img"
          aria-label="Error icon"
        >
          <title>Error</title>
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>

      {/* Error Title */}
      <h1
        style={{
          fontSize: "24px",
          fontWeight: "bold",
          color: "var(--white, #fff)",
          margin: 0,
        }}
      >
        Sign-in Failed
      </h1>

      {/* Error Message */}
      <p
        style={{
          color: "var(--gray, #888)",
          fontSize: "14px",
          lineHeight: "1.5",
          margin: 0,
        }}
      >
        {errorMessage}
      </p>

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          width: "100%",
        }}
      >
        <button
          type="button"
          onClick={onRetry}
          style={{
            backgroundColor: "var(--white, #fff)",
            color: "var(--black, #000)",
            border: "none",
            borderRadius: "8px",
            padding: "12px 24px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Try Again with Google
        </button>

        <a
          href="/login"
          style={{
            color: "var(--gray, #888)",
            fontSize: "14px",
            textDecoration: "underline",
            textAlign: "center",
          }}
        >
          Back to Login
        </a>
      </div>
    </div>
  );
}

/**
 * Main callback content component that handles the SSO callback logic
 */
function GoogleCallbackContent() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{
    code: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") {
      return;
    }

    // Handle null searchParams (shouldn't happen with Suspense, but be safe)
    if (!searchParams) {
      setIsLoading(false);
      setError({
        code: "unknown_error",
        message: getSSOErrorMessage("unknown_error"),
      });
      return;
    }

    // Convert ReadonlyURLSearchParams to URLSearchParams for compatibility
    const params = new URLSearchParams(searchParams.toString());

    // Parse the callback parameters
    const result = handleSSOCallback(params);

    if (result.success && result.redirectUrl) {
      // Success - redirect to the app
      window.location.href = result.redirectUrl;
    } else {
      // Error - show error state
      setIsLoading(false);
      setError({
        code: result.error || "unknown_error",
        message:
          result.errorMessage ||
          getSSOErrorMessage(result.error || "unknown_error"),
      });
    }
  }, [searchParams]);

  // Handle retry - redirect back to Google OAuth
  const handleRetry = () => {
    window.location.href = "/api/auth/sso/google/redirect";
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--background, #000)",
        padding: "24px",
      }}
    >
      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorDisplay errorMessage={error.message} onRetry={handleRetry} />
      ) : null}
    </div>
  );
}

/**
 * Google OAuth Callback Page
 *
 * This page handles the redirect from Google OAuth after user authentication.
 * It extracts tokens from URL parameters, stores them, and redirects to the app.
 *
 * Expected URL parameters on success:
 * - accessToken: The access token for API requests
 * - refreshToken: The refresh token for session renewal
 * - verified: Whether the user's email is verified
 *
 * Expected URL parameters on error:
 * - error: Error code (e.g., "access_denied", "invalid_state")
 * - error_description: Human-readable error description
 */
export default function GoogleCallbackPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--background, #000)",
          }}
        >
          <LoadingSpinner />
        </div>
      }
    >
      <GoogleCallbackContent />
    </Suspense>
  );
}
