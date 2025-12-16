"use client";

import { analytics } from "frontend-base/src/analytics";
import { $env } from "frontend-envs";
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
 * - Platform super property for web vs mobile analytics
 * - Initial user properties (language, country, registration status)
 *
 * PostHog is only initialized when posthogKey is set in the env store.
 */
export function PostHogProvider({ children }: PostHogProviderProps) {
  const initialized = useRef(false);
  const propertiesSet = useRef(false);

  useEffect(() => {
    // Only initialize once and only in the browser
    if (initialized.current || typeof window === "undefined") {
      return;
    }

    const { posthogKey, posthogHost, posthogSessionReplay } = $env.get();

    // Do not initialize if API key is not set
    if (!posthogKey) {
      console.debug("PostHog: API key not set, skipping initialization");
      return;
    }

    posthog.init(posthogKey, {
      api_host: posthogHost,
      // Automatic page view tracking
      capture_pageview: true,
      // Automatic page leave tracking for accurate session duration
      capture_pageleave: true,
      // Session replay configuration
      disable_session_recording: !posthogSessionReplay,
      // Persist user identity across sessions
      persistence: "localStorage+cookie",
      // Only load PostHog after page load for better performance
      loaded: (posthogInstance) => {
        // Enable debug mode in development
        if (process.env.NODE_ENV === "development") {
          posthogInstance.debug();
        }

        // Register platform super property - this is included in EVERY event
        posthogInstance.register({ platform: "web" });

        // Set initial user properties if not already set
        if (!propertiesSet.current) {
          const language = navigator.language; // e.g., 'en-US'
          // Extract country from locale (e.g., 'en-US' -> 'US', 'pt-BR' -> 'BR')
          const localeParts = language.split("-");
          const country =
            localeParts.length > 1
              ? localeParts[1].toUpperCase()
              : language.toUpperCase().slice(0, 2);

          // Set initial properties for anonymous users
          // These will be updated when user logs in
          analytics.setUserProperties({
            language_setting: language,
            country: country,
            is_registered: false,
          });

          propertiesSet.current = true;
        }
      },
    });

    initialized.current = true;
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
