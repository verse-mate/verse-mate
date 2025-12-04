"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type ReactNode, useEffect, useRef } from "react";

interface PostHogProviderProps {
  children: ReactNode;
}

/**
 * PostHog Analytics Provider
 *
 * Initializes PostHog client-side analytics with:
 * - Automatic page view tracking
 * - Web vitals tracking
 * - Session replay (configurable via environment variable)
 * - GDPR-compliant opt-out by default
 *
 * PostHog is only initialized when NEXT_PUBLIC_POSTHOG_KEY is set.
 */
export function PostHogProvider({ children }: PostHogProviderProps) {
  const initialized = useRef(false);

  useEffect(() => {
    // Only initialize once and only in the browser
    if (initialized.current || typeof window === "undefined") {
      return;
    }

    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const posthogHost =
      process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
    const sessionReplayEnabled =
      process.env.NEXT_PUBLIC_POSTHOG_SESSION_REPLAY === "true";

    // Do not initialize if API key is not set
    if (!posthogKey) {
      console.debug("PostHog: API key not set, skipping initialization");
      return;
    }

    posthog.init(posthogKey, {
      api_host: posthogHost,
      // GDPR compliance: opt out by default, user must consent
      opt_out_capturing_by_default: true,
      // Automatic page view tracking
      capture_pageview: true,
      // Automatic page leave tracking for accurate session duration
      capture_pageleave: true,
      // Session replay configuration
      disable_session_recording: !sessionReplayEnabled,
      // Persist user identity across sessions
      persistence: "localStorage+cookie",
      // Only load PostHog after page load for better performance
      loaded: (posthogInstance) => {
        // Enable debug mode in development
        if (process.env.NODE_ENV === "development") {
          posthogInstance.debug();
        }
      },
    });

    initialized.current = true;
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
