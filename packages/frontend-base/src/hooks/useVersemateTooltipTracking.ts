import { useCallback, useRef } from "react";
import { AnalyticsEvent, analytics } from "../analytics";

/**
 * Hook to track VERSEMATE_TOOLTIP_OPENED analytics event.
 *
 * Returns a function that should be called when the VerseMate tooltip is opened.
 * Uses a ref to prevent duplicate tracking for the same verse in quick succession.
 *
 * @example
 * const { trackTooltipOpened } = useVersemateTooltipTracking();
 *
 * // When tooltip is opened:
 * trackTooltipOpened(bookId, chapterNumber, verseNumber);
 */
export const useVersemateTooltipTracking = () => {
  // Track the last tracked tooltip to prevent duplicate events
  const lastTrackedRef = useRef<string | null>(null);
  const lastTrackedTimeRef = useRef<number>(0);

  // Debounce period of 1 second to prevent rapid duplicate events
  const DEBOUNCE_MS = 1000;

  const trackTooltipOpened = useCallback(
    (bookId: number, chapterNumber: number, verseNumber: number) => {
      const now = Date.now();
      const tooltipKey = `${bookId}-${chapterNumber}-${verseNumber}`;

      // Don't track if same tooltip was tracked within debounce period
      if (
        lastTrackedRef.current === tooltipKey &&
        now - lastTrackedTimeRef.current < DEBOUNCE_MS
      ) {
        return;
      }

      // Track the VERSEMATE_TOOLTIP_OPENED event
      analytics.track(AnalyticsEvent.VERSEMATE_TOOLTIP_OPENED, {
        bookId,
        chapterNumber,
        verseNumber,
      });

      // Update refs
      lastTrackedRef.current = tooltipKey;
      lastTrackedTimeRef.current = now;
    },
    [],
  );

  return { trackTooltipOpened };
};
