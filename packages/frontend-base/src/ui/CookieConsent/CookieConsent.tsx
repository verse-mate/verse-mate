"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../Button/Button";
import styles from "./CookieConsent.module.css";

/**
 * Cookie consent storage key for localStorage
 */
export const CONSENT_STORAGE_KEY = "cookie-consent";
export const CONSENT_ACKNOWLEDGED = "acknowledged";

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
 * Displays an informational banner about cookie usage.
 * - Shows only on first visit (when no acknowledgment exists in localStorage)
 * - OK button dismisses the banner
 * - Acknowledgment is persisted in localStorage
 *
 * @example
 * <CookieConsent privacyPolicyUrl="/privacy-policy" />
 */
export function CookieConsent({
  privacyPolicyUrl = "/privacy",
}: CookieConsentProps) {
  // TODO: Enable cookie consent banner once privacy policy is ready
  return null;

  // biome-ignore lint/correctness/noUnreachable: <explanation>
  const [showBanner, setShowBanner] = useState(false);

  // Check localStorage on mount to determine if banner should show
  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") {
      return;
    }

    const storedConsent = localStorage.getItem(CONSENT_STORAGE_KEY);

    // Show banner only on first visit (when no acknowledgment exists)
    if (storedConsent === null) {
      setShowBanner(true);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    // Persist acknowledgment in localStorage
    localStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_ACKNOWLEDGED);

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
            onClick={handleDismiss}
            variant="contained"
            color="var(--dust)"
            format="soft"
          >
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
