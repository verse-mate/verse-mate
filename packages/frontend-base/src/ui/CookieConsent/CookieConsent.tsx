"use client";

import posthog from "posthog-js";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../Button/Button";
import styles from "./CookieConsent.module.css";

/**
 * Cookie consent storage key for localStorage
 */
export const CONSENT_STORAGE_KEY = "posthog-consent";
export const CONSENT_ACCEPTED = "accepted";
export const CONSENT_DECLINED = "declined";

export interface CookieConsentProps {
  /**
   * URL for the privacy policy page
   * @default "/privacy"
   */
  privacyPolicyUrl?: string;
}

/**
 * Cookie Consent Banner Component
 *
 * Displays a consent banner for analytics tracking (PostHog).
 * - Shows only on first visit (when no consent state exists in localStorage)
 * - Accept button calls posthog.opt_in_capturing() and enables tracking
 * - Decline button calls posthog.opt_out_capturing() and disables tracking
 * - Consent choice is persisted in localStorage
 *
 * @example
 * <CookieConsent privacyPolicyUrl="/privacy-policy" />
 */
export function CookieConsent({
  privacyPolicyUrl = "/privacy",
}: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(false);

  // Check localStorage on mount to determine if banner should show
  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") {
      return;
    }

    const storedConsent = localStorage.getItem(CONSENT_STORAGE_KEY);

    // Show banner only on first visit (when no consent state exists)
    if (storedConsent === null) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = useCallback(() => {
    // Enable PostHog tracking
    posthog.opt_in_capturing();

    // Persist choice in localStorage
    localStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_ACCEPTED);

    // Hide banner
    setShowBanner(false);
  }, []);

  const handleDecline = useCallback(() => {
    // Disable PostHog tracking
    posthog.opt_out_capturing();

    // Persist choice in localStorage
    localStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_DECLINED);

    // Hide banner
    setShowBanner(false);
  }, []);

  // Don't render if banner should not be shown
  if (!showBanner) {
    return null;
  }

  return (
    <div className={styles.container} role="dialog" aria-label="Cookie consent">
      <div className={styles.content}>
        <p className={styles.message}>
          We use cookies to improve your experience and analyze site usage.{" "}
          <a
            href={privacyPolicyUrl}
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more in our Privacy Policy
          </a>
        </p>
        <div className={styles.actions}>
          <Button
            onClick={handleDecline}
            variant="outlined"
            color="var(--gray)"
            format="soft"
          >
            Decline
          </Button>
          <Button
            onClick={handleAccept}
            variant="contained"
            color="var(--dust)"
            format="soft"
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
