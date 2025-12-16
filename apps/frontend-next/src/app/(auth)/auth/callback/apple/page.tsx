"use client";

import { AnalyticsEvent, analytics } from "frontend-base/src/analytics";
import {
  getSSOErrorMessage,
  handleSSOCallback,
} from "frontend-base/src/auth/lib";
import { decodeJwtPayload } from "frontend-base/src/utils/auth-utils";
import { useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useEffect, useState } from "react";
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
        message: getAppleErrorMessage("unknown_error"),
      });
      return;
    }

    // Convert ReadonlyURLSearchParams to URLSearchParams for compatibility
    const params = new URLSearchParams(searchParams.toString());

    // Get access token before it's consumed by handleSSOCallback
    const accessToken = params.get("accessToken");

    // Parse the callback parameters
    const result = handleSSOCallback(params);

    if (result.success && result.redirectUrl) {
      // Track analytics for successful Apple SSO login
      if (accessToken) {
        try {
          const jwtPayload = decodeJwtPayload(accessToken);
          const userId = jwtPayload?.sub;
          const email = jwtPayload?.email;
          const isNewUser = jwtPayload?.isNewUser;

          if (userId) {
            // Identify user in PostHog first
            posthog.identify(userId, { email });

            // Set user properties
            analytics.setUserProperties({
              email,
              account_type: "apple",
              is_registered: true,
            });

            // If this is a new user, fire SIGNUP_COMPLETED
            if (isNewUser) {
              analytics.track(AnalyticsEvent.SIGNUP_COMPLETED, {
                method: "apple",
              });
            }

            // Always fire LOGIN_COMPLETED
            analytics.track(AnalyticsEvent.LOGIN_COMPLETED, {
              method: "apple",
            });
          }
        } catch (err) {
          // Analytics tracking should not block login
          console.debug("Analytics tracking skipped:", err);
        }
      }

      // Success - redirect to the app
      window.location.href = result.redirectUrl;
    } else {
      // Error - show error state with Apple-specific message
      setIsLoading(false);

      const errorCode = result.error || "unknown_error";
      setError({
        code: errorCode,
        message: getAppleErrorMessage(
          errorCode,
          // Parse error_description from URL if present
          searchParams.get("error_description") || undefined,
        ),
      });
    }
  }, [searchParams]);

  // Handle retry - redirect back to Apple OAuth
  const handleRetry = () => {
    window.location.href = "/api/auth/sso/apple/redirect";
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

/**
 * Apple Sign In Callback Page
 *
 * This page handles the redirect from Apple Sign In after user authentication.
 * It extracts tokens from URL parameters, stores them, and redirects to the app.
 *
 * Expected URL parameters on success:
 * - accessToken: The access token for API requests
 * - refreshToken: The refresh token for session renewal
 * - verified: Whether the user's email is verified
 *
 * Expected URL parameters on error:
 * - error: Error code (e.g., "user_cancelled_authorize", "access_denied")
 * - error_description: Human-readable error description
 *
 * Apple-specific notes:
 * - Apple may use "user_cancelled_authorize" when user cancels
 * - Apple sends callbacks as POST, which backend handles and redirects as GET
 * - First-time sign-in includes user name data, subsequent logins may not
 */
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
