import { useCallback, useEffect, useState } from "react";
import {
  type BibleChapter,
  type BibleExplanation,
  bibleCache,
  cacheBibleChapter,
  cacheBibleExplanation,
  getCachedBibleChapter,
  getCachedBibleExplanation,
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
        if (enableOffline && (isOffline || !data)) {
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
            // If fetch fails but we have cached data, use that
            if (data && isFromCache) {
              console.warn(
                "Failed to fetch fresh data, using cached version:",
                fetchError,
              );
            } else {
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
  }, [
    bookId,
    chapterNumber,
    isOffline,
    enableOffline,
    fetchFunction,
    data,
    isFromCache,
  ]);

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
  const { isOffline } = useNetworkStatus();

  useEffect(() => {
    let isCancelled = false;

    const loadExplanation = async () => {
      if (isCancelled) return;

      setLoading(true);
      setError(null);

      try {
        // Try to get from cache first if offline or if enabled
        if (enableOffline && (isOffline || !data)) {
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
        if (!isOffline) {
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
            // If fetch fails but we have cached data, use that
            if (data && isFromCache) {
              console.warn(
                "Failed to fetch fresh explanation, using cached version:",
                fetchError,
              );
            } else {
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
    enableOffline,
    fetchFunction,
    data,
    isFromCache,
  ]);

  return {
    data,
    loading,
    error,
    isFromCache,
  };
}

// Hook for managing offline book downloads
export function useOfflineBookManager() {
  const [downloadProgress, setDownloadProgress] = useState<{
    [bookId: number]: number;
  }>({});
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadBookForOffline = useCallback(
    async (
      bookId: number,
      totalChapters: number,
      fetchChapterFunction: (chapterNumber: number) => Promise<any>,
    ) => {
      setIsDownloading(true);
      setDownloadProgress((prev) => ({ ...prev, [bookId]: 0 }));

      try {
        for (let chapter = 1; chapter <= totalChapters; chapter++) {
          const chapterData = await fetchChapterFunction(chapter);

          if (chapterData) {
            const dataToCache = {
              bookId,
              chapterNumber: chapter,
              ...chapterData,
              cachedAt: Date.now(),
            };
            await cacheBibleChapter(dataToCache);
          }

          const progress = Math.round((chapter / totalChapters) * 100);
          setDownloadProgress((prev) => ({ ...prev, [bookId]: progress }));
        }
      } catch (error) {
        console.error("Error downloading book for offline:", error);
        throw error;
      } finally {
        setIsDownloading(false);
        setDownloadProgress((prev) => ({ ...prev, [bookId]: 100 }));
      }
    },
    [],
  );

  const getOfflineProgress = useCallback(
    (bookId: number) => downloadProgress[bookId] || 0,
    [downloadProgress],
  );

  const getCachedChaptersCount = useCallback(
    async (bookId: number): Promise<number> => {
      const cachedChapters = await bibleCache.getCachedChaptersForBook(bookId);
      return cachedChapters.length;
    },
    [],
  );

  return {
    downloadBookForOffline,
    isDownloading,
    getOfflineProgress,
    getCachedChaptersCount,
  };
}
