import { useCallback, useRef } from "react";
import { AnalyticsEvent, analytics } from "../analytics";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

export const useBibleVersion = () => {
  const { bibleVersion } = useGetSearchParams();
  const { saveBibleVersionOnURL } = useSaveSearchParams();

  // Keep track of the previous version for analytics
  const previousVersionRef = useRef<string | null>(null);

  // Initialize previous version on first access
  if (previousVersionRef.current === null) {
    previousVersionRef.current = bibleVersion || "NASB1995";
  }

  const setBibleVersion = useCallback(
    (newVersion: string) => {
      const previousVersion = previousVersionRef.current || "NASB1995";

      // Only track and update if the version is actually changing
      if (previousVersion !== newVersion) {
        // Track BIBLE_VERSION_CHANGED event
        analytics.track(AnalyticsEvent.BIBLE_VERSION_CHANGED, {
          previousVersion,
          newVersion,
        });

        // Update the ref for next time
        previousVersionRef.current = newVersion;

        // Also update user properties
        analytics.setUserProperties({
          preferred_bible_version: newVersion,
        });
      }

      // Call the original function to update the URL
      saveBibleVersionOnURL(newVersion);
    },
    [saveBibleVersionOnURL],
  );

  return {
    bibleVersion: bibleVersion || "NASB1995",
    setBibleVersion,
  };
};
