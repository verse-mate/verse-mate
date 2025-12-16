import { useEffect, useRef } from "react";
import { AnalyticsEvent, analytics } from "../analytics";

/**
 * Hook to track CHAPTER_VIEWED analytics event.
 *
 * Tracks when a user views a Bible chapter.
 * Uses refs to prevent duplicate tracking of the same chapter.
 *
 * @param bookId - The book ID (1-66)
 * @param chapterNumber - The chapter number
 * @param bibleVersion - The Bible version (e.g., 'NASB1995', 'KJV')
 * @param isViewingTopic - Whether the user is viewing a topic (not a Bible chapter)
 */
export const useChapterViewedTracking = (
  bookId: number | undefined,
  chapterNumber: number | undefined,
  bibleVersion: string | undefined,
  isViewingTopic = false,
) => {
  // Track the last viewed chapter to prevent duplicate events
  const lastTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    // Don't track if viewing a topic or missing required data
    if (isViewingTopic || !bookId || !chapterNumber || !bibleVersion) {
      return;
    }

    // Create a unique key for this chapter view
    const chapterKey = `${bookId}-${chapterNumber}-${bibleVersion}`;

    // Don't track if we've already tracked this exact chapter view
    if (lastTrackedRef.current === chapterKey) {
      return;
    }

    // Track the CHAPTER_VIEWED event
    analytics.track(AnalyticsEvent.CHAPTER_VIEWED, {
      bookId,
      chapterNumber,
      bibleVersion,
    });

    // Update the ref to prevent duplicate tracking
    lastTrackedRef.current = chapterKey;
  }, [bookId, chapterNumber, bibleVersion, isViewingTopic]);
};
