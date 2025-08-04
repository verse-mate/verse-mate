import { useCallback, useEffect, useState } from "react";
import {
  type BibleChapter,
  cacheBibleChapter,
  getCachedBibleChapter,
} from "../utils/offline-bible-cache";
import { useNetworkStatus } from "./useNetworkStatus";

interface UseBibleChapterOptions {
  bookId: number;
  chapterNumber: number;
  fetchFunction: () => Promise<any>;
  enableOffline?: boolean;
}

interface UseBibleChapterResult {
  data: any | null;
  loading: boolean;
  error: string | null;
  isFromCache: boolean;
  cacheChapter: () => Promise<void>;
}

export function useOfflineBibleChapter({
  bookId,
  chapterNumber,
  fetchFunction,
  enableOffline = true,
}: UseBibleChapterOptions): UseBibleChapterResult {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const { isOffline } = useNetworkStatus();

  useEffect(() => {
    let isCancelled = false;

    const loadChapter = async () => {
      if (isCancelled) return;

      setLoading(true);
      setError(null);

      try {
        // Try to get from cache first if offline or if enabled
        if (enableOffline && isOffline) {
          const cachedChapter = await getCachedBibleChapter(
            bookId,
            chapterNumber,
          );
          if (cachedChapter && !isCancelled) {
            setData(cachedChapter);
            setIsFromCache(true);
            setLoading(false);

            // If we're offline, stop here
            if (isOffline) {
              return;
            }
          }
        }

        // Try to fetch fresh data if online
        if (!isOffline) {
          try {
            const freshData = await fetchFunction();
            if (!isCancelled) {
              setData(freshData);
              setIsFromCache(false);

              // Cache the fresh data
              if (enableOffline && freshData) {
                await cacheBibleChapter({
                  bookId,
                  chapterNumber,
                  ...freshData,
                  cachedAt: Date.now(),
                });
              }
            }
          } catch (fetchError) {
            // If fetch fails, let the cached data (if any) remain
            console.warn("Failed to fetch fresh data:", fetchError);
            // Don't throw if we have cached data, otherwise throw
            const hasCachedData = await getCachedBibleChapter(
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
            err instanceof Error ? err.message : "Failed to load chapter",
          );
          console.error("Error loading Bible chapter:", err);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadChapter();

    return () => {
      isCancelled = true;
    };
  }, [bookId, chapterNumber, isOffline, enableOffline, fetchFunction]);

  const cacheChapter = useCallback(async () => {
    if (data) {
      await cacheBibleChapter({
        bookId,
        chapterNumber,
        ...data,
        cachedAt: Date.now(),
      });
    }
  }, [data, bookId, chapterNumber]);

  return {
    data,
    loading,
    error,
    isFromCache,
    cacheChapter,
  };
}
