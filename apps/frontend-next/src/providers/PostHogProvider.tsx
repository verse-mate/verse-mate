"use client";

/**
 * PostHog Analytics Provider
 *
 * Initializes PostHog client-side analytics with:
 * - Automatic page view tracking
 * - Web vitals tracking
 * - Session replay (configurable via environment variable)
 * - Platform super property for web vs mobile analytics
 * - Initial user properties (language, country, registration status)
 * - Global error handlers for window errors and unhandled promise rejections
 *
 * PostHog is only initialized when posthogKey is set in the env store.
 *
 * @see Spec: agent-os/specs/2025-12-17-posthog-frontend-exception-tracking/spec.md
 */

import {
  analytics,
  collectErrorContext,
  shouldExcludeError,
} from "frontend-base/src/analytics";
import { $env } from "frontend-envs";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type ReactNode, useCallback, useEffect, useRef } from "react";

interface PostHogProviderProps {
  children: ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  const initialized = useRef(false);
  const propertiesSet = useRef(false);
  const errorHandlersSet = useRef(false);

  /**
   * Handle uncaught window errors
   * Captures errors to PostHog with comprehensive context
   *
   * Note: window.onerror signature is (message, source, lineno, colno, error)
   * where message can be string or Event
   */
  const handleWindowError = useCallback(
    (
      message: string | Event,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error,
    ) => {
      // Extract error from parameters
      // The error parameter is the most reliable source when available
      let errorObj: Error;

      if (error) {
        errorObj = error;
      } else if (message instanceof Event) {
        // If message is an Event (ErrorEvent), try to extract error from it
        const errorEvent = message as ErrorEvent;
        errorObj =
          errorEvent.error || new Error(errorEvent.message || "Unknown error");
      } else {
        // message is a string error message
        errorObj = new Error(
          typeof message === "string" ? message : "Unknown error",
        );
      }

      // Apply exclusion filters
      if (shouldExcludeError(errorObj)) {
        return;
      }

      // Collect context and capture exception
      const context = {
        ...collectErrorContext(),
        source: "window-error",
        ...(source && { error_source: source }),
        ...(lineno !== undefined && { line_number: lineno }),
        ...(colno !== undefined && { column_number: colno }),
      };

      analytics.captureException(errorObj, context);
    },
    [],
  );

  /**
   * Handle unhandled promise rejections
   * Captures to PostHog with source tag for identification
   */
  const handleUnhandledRejection = useCallback(
    (event: PromiseRejectionEvent) => {
      // Extract error from rejection reason
      const error =
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason));

      // Apply exclusion filters
      if (shouldExcludeError(error)) {
        return;
      }

      // Collect context and capture exception
      const context = {
        ...collectErrorContext(),
        source: "unhandled-promise",
      };

      analytics.captureException(error, context);
    },
    [],
  );

  // Initialize PostHog
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

  // Set up global error handlers
  useEffect(() => {
    // Only set up handlers once and only in the browser
    if (errorHandlersSet.current || typeof window === "undefined") {
      return;
    }

    // Check if analytics is enabled
    if (!analytics.isEnabled()) {
      return;
    }

    // Store original handlers to call them after our handlers
    const originalOnError = window.onerror;
    const originalOnUnhandledRejection = window.onunhandledrejection;

    // Set up window.onerror handler
    window.onerror = (message, source, lineno, colno, error) => {
      handleWindowError(message, source, lineno, colno, error);
      // Call original handler if it exists
      if (typeof originalOnError === "function") {
        return originalOnError(message, source, lineno, colno, error);
      }
      return false;
    };

    // Set up window.onunhandledrejection handler
    window.onunhandledrejection = (event) => {
      handleUnhandledRejection(event);
      // Call original handler if it exists
      if (typeof originalOnUnhandledRejection === "function") {
        return originalOnUnhandledRejection.call(window, event);
      }
    };

    errorHandlersSet.current = true;

    // Cleanup function to restore original handlers
    return () => {
      window.onerror = originalOnError;
      window.onunhandledrejection = originalOnUnhandledRejection;
      errorHandlersSet.current = false;
    };
  }, [handleWindowError, handleUnhandledRejection]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
