/**
 * useAnalytics Hook
 *
 * Provides component-level access to analytics tracking.
 * Wraps the analytics service for use in React components.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { track, isEnabled } = useAnalytics();
 *
 *   const handleClick = () => {
 *     track(AnalyticsEvent.BOOKMARK_ADDED, {
 *       bookId: 1,
 *       chapterNumber: 1
 *     });
 *   };
 *
 *   return <button onClick={handleClick}>Add Bookmark</button>;
 * }
 * ```
 */

import { useCallback, useMemo } from "react";
import {
  AnalyticsEvent,
  type EventProperties,
  type UserProperties,
  analytics,
} from "../analytics";

export { AnalyticsEvent };

export interface UseAnalyticsReturn {
  /**
   * Track an analytics event with typed properties
   */
  track: <E extends AnalyticsEvent>(
    event: E,
    properties: EventProperties[E],
  ) => void;

  /**
   * Identify a user and set their properties
   */
  identify: (userId: string, traits: UserProperties) => void;

  /**
   * Set user properties without requiring identify
   */
  setUserProperties: (properties: Partial<UserProperties>) => void;

  /**
   * Reset analytics state (called on logout)
   */
  reset: () => void;

  /**
   * Whether analytics tracking is enabled (false in development)
   */
  isEnabled: boolean;
}

/**
 * Hook for analytics tracking in React components
 *
 * @returns Analytics methods and state
 */
export function useAnalytics(): UseAnalyticsReturn {
  const track = useCallback(
    <E extends AnalyticsEvent>(event: E, properties: EventProperties[E]) => {
      analytics.track(event, properties);
    },
    [],
  );

  const identify = useCallback((userId: string, traits: UserProperties) => {
    analytics.identify(userId, traits);
  }, []);

  const setUserProperties = useCallback(
    (properties: Partial<UserProperties>) => {
      analytics.setUserProperties(properties);
    },
    [],
  );

  const reset = useCallback(() => {
    analytics.reset();
  }, []);

  const isEnabled = useMemo(() => analytics.isEnabled(), []);

  return {
    track,
    identify,
    setUserProperties,
    reset,
    isEnabled,
  };
}
