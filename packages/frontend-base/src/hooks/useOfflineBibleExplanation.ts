import { useEffect, useState } from "react";
import {
  type BibleExplanation,
  cacheBibleExplanation,
  getCachedBibleExplanation,
} from "../utils/offline-bible-cache";
import { useNetworkStatus } from "./useNetworkStatus";

interface UseBibleExplanationOptions {
  bookId: number;
  chapterNumber: number;
  fetchFunction: () => Promise<any>;
  enableOffline?: boolean;
}

export function useOfflineBibleExplanation({
  bookId,
  chapterNumber,
  fetchFunction,
  enableOffline = true,
}: UseBibleExplanationOptions) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const { isOnline, isOffline } = useNetworkStatus();

  useEffect(() => {
    let isCancelled = false;

    const loadExplanation = async () => {
      if (isCancelled) return;

      setLoading(true);
      setError(null);

      try {
        // Try to get from cache first if offline or if enabled
        if (enableOffline && isOffline) {
          const cachedExplanation = await getCachedBibleExplanation(
            bookId,
            chapterNumber,
          );
          if (cachedExplanation && !isCancelled) {
            setData(cachedExplanation.explanations);
            setIsFromCache(true);
            setLoading(false);

            // If we're offline, stop here
            if (isOffline) {
              return;
            }
          }
        }

        // Try to fetch fresh data if online
        if (isOnline) {
          try {
            const freshData = await fetchFunction();
            if (!isCancelled) {
              setData(freshData);
              setIsFromCache(false);

              // Cache the fresh data
              if (enableOffline && freshData) {
                await cacheBibleExplanation({
                  bookId,
                  chapterNumber,
                  explanations: freshData,
                  cachedAt: Date.now(),
                });
              }
            }
          } catch (fetchError) {
            // If fetch fails, let the cached data (if any) remain
            console.warn("Failed to fetch fresh explanation:", fetchError);
            // Don't throw if we have cached data, otherwise throw
            const hasCachedData = await getCachedBibleExplanation(
              bookId,
              chapterNumber,
            );
            if (!hasCachedData) {
              throw fetchError;
            }
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load explanation",
          );
          console.error("Error loading Bible explanation:", err);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadExplanation();

    return () => {
      isCancelled = true;
    };
  }, [
    bookId,
    chapterNumber,
    isOffline,
    isOnline,
    enableOffline,
    fetchFunction,
  ]);

  return {
    data,
    loading,
    error,
    isFromCache,
  };
}
