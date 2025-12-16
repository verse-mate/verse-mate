/**
 * Analytics Service
 *
 * Thin wrapper over PostHog SDK providing type-safe analytics tracking.
 * Tracking is disabled when posthogKey is not configured.
 *
 * @see Spec: agent-os/specs/2025-12-15-posthog-product-analytics/spec.md
 */

import { $env } from "frontend-envs";
import posthog from "posthog-js";
import type { AnalyticsEvent, EventProperties, UserProperties } from "./types";

/**
 * Check if analytics is enabled by verifying posthogKey is configured
 */
function isAnalyticsEnabled(): boolean {
  return Boolean($env.get().posthogKey);
}

/**
 * Type for PostHog-compatible properties
 * PostHog accepts string, number, boolean, null, or nested objects/arrays of these
 */
type PostHogCompatibleValue =
  | string
  | number
  | boolean
  | null
  | PostHogCompatibleValue[]
  | { [key: string]: PostHogCompatibleValue };

type PostHogProperties = Record<string, PostHogCompatibleValue>;

/**
 * Analytics service singleton
 *
 * Provides type-safe methods for tracking events and identifying users.
 * Skips all tracking when posthogKey is not configured.
 */
export const analytics = {
  /**
   * Track an analytics event with typed properties
   *
   * @param event - The event name from AnalyticsEvent enum
   * @param properties - Typed properties for the event
   *
   * @example
   * ```ts
   * analytics.track(AnalyticsEvent.CHAPTER_VIEWED, {
   *   bookId: 1,
   *   chapterNumber: 1,
   *   bibleVersion: 'NASB1995'
   * });
   * ```
   */
  track<E extends AnalyticsEvent>(
    event: E,
    properties: EventProperties[E],
  ): void {
    // Skip tracking when PostHog is not configured
    if (!isAnalyticsEnabled()) {
      return;
    }

    // Cast properties to PostHog-compatible type
    // Our typed interfaces ensure correct properties at compile time
    posthog.capture(event, properties as unknown as PostHogProperties);
  },

  /**
   * Identify a user and set their properties
   *
   * @param userId - Unique user identifier
   * @param traits - User properties to set
   *
   * @example
   * ```ts
   * analytics.identify('user-123', {
   *   email: 'user@example.com',
   *   account_type: 'email',
   *   is_registered: true
   * });
   * ```
   */
  identify(userId: string, traits: UserProperties): void {
    // Skip tracking when PostHog is not configured
    if (!isAnalyticsEnabled()) {
      return;
    }

    // Cast traits to PostHog-compatible type
    posthog.identify(userId, traits as unknown as PostHogProperties);
  },

  /**
   * Reset analytics state (called on logout)
   *
   * Clears the current user identity and creates a new anonymous ID.
   */
  reset(): void {
    // Skip tracking when PostHog is not configured
    if (!isAnalyticsEnabled()) {
      return;
    }

    posthog.reset();
  },

  /**
   * Set user properties without requiring identify
   *
   * Uses PostHog's $set operator to update person properties.
   * Works for both anonymous and identified users.
   *
   * @param properties - User properties to set
   *
   * @example
   * ```ts
   * analytics.setUserProperties({
   *   preferred_bible_version: 'KJV',
   *   theme_preference: 'dark'
   * });
   * ```
   */
  setUserProperties(properties: Partial<UserProperties>): void {
    // Skip tracking when PostHog is not configured
    if (!isAnalyticsEnabled()) {
      return;
    }

    posthog.capture("$set", { $set: properties });
  },

  /**
   * Register super properties that are sent with every event
   *
   * Used to set properties like `platform: 'web'` that should
   * be included in all events automatically.
   *
   * @param properties - Properties to include with every event
   *
   * @example
   * ```ts
   * analytics.registerSuperProperties({ platform: 'web' });
   * ```
   */
  registerSuperProperties(
    properties: Record<string, string | number | boolean>,
  ): void {
    // Skip tracking when PostHog is not configured
    if (!isAnalyticsEnabled()) {
      return;
    }

    posthog.register(properties);
  },

  /**
   * Check if analytics is enabled
   *
   * Returns false when posthogKey is not configured.
   */
  isEnabled(): boolean {
    return isAnalyticsEnabled();
  },
};
