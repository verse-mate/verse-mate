"use client";

import { exchangeSSOCode } from "frontend-base/src/api/auth";
import {
  completeSSOCallback,
  getSSOErrorMessage,
  startSSOSignIn,
} from "frontend-base/src/auth/lib";
import { $env } from "frontend-envs";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import styles from "../callback.module.css";

/**
 * Apple-specific error code mapping
 * Apple uses specific error codes that we need to translate
 */
const APPLE_ERROR_MESSAGES: Record<string, string> = {
  user_cancelled_authorize:
    "You cancelled the sign-in process. Please try again when ready.",
  invalid_request: "The sign-in request was invalid. Please try again.",
  invalid_response: "Apple returned an invalid response. Please try again.",
  invalid_client:
    "There's a configuration issue with Apple Sign In. Please contact support.",
  unauthorized_client:
    "Apple Sign In is not properly authorized. Please contact support.",
  access_denied:
    "You denied access to your Apple account. Please try again and allow access to continue.",
};

/**
 * Get Apple-specific error message
 */
function getAppleErrorMessage(
  errorCode: string,
  errorDescription?: string,
): string {
  // Check for Apple-specific errors first
  if (APPLE_ERROR_MESSAGES[errorCode]) {
    return APPLE_ERROR_MESSAGES[errorCode];
  }

  // Fall back to generic SSO error message
  return getSSOErrorMessage(errorCode, errorDescription);
}

/**
 * Loading spinner component for the callback page
 */
function LoadingSpinner() {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.spinner} />
      <p className={styles.loadingText}>Completing sign-in...</p>
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
    <div className={styles.errorContainer}>
      {/* Error Icon */}
      <div className={styles.errorIconWrapper}>
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.errorIcon}
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
      <h1 className={styles.errorTitle}>Sign-in Failed</h1>

      {/* Error Message */}
      <p className={styles.errorMessage}>{errorMessage}</p>

      {/* Action Buttons */}
      <div className={styles.errorActions}>
        <button
          type="button"
          onClick={onRetry}
          className={styles.retryButtonApple}
        >
          Try Again with Apple
        </button>

        <a href="/login" className={styles.backLink}>
          Back to Login
        </a>
      </div>
    </div>
  );
}

/**
 * Main callback content component that handles the SSO callback logic
 */
function AppleCallbackContent() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || handled.current) {
      return;
    }
    handled.current = true;

    // Handle null searchParams (shouldn't happen with Suspense, but be safe)
    if (!searchParams) {
      setIsLoading(false);
      setError({
        code: "unknown_error",
        message: getAppleErrorMessage("unknown_error"),
      });
      return;
    }

    completeSSOCallback(searchParams.toString(), exchangeSSOCode).then(
      (result) => {
        if (result.success && result.redirectUrl) {
          window.location.href = result.redirectUrl;
        } else {
          setIsLoading(false);

          const errorCode = result.error || "unknown_error";
          setError({
            code: errorCode,
            message: getAppleErrorMessage(
              errorCode,
              searchParams.get("error_description") || undefined,
            ),
          });
        }
      },
    );
  }, [searchParams]);

  const handleRetry = () => {
    void startSSOSignIn($env.get().apiUrl, "apple");
  };

  return (
    <div className={styles.pageContainer}>
      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorDisplay errorMessage={error.message} onRetry={handleRetry} />
      ) : null}
    </div>
  );
}

export default function AppleCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.pageContainer}>
          <LoadingSpinner />
        </div>
      }
    >
      <AppleCallbackContent />
    </Suspense>
  );
}
