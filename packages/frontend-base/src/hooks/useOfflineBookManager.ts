import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  bibleCache,
  cacheBibleChapter,
  cacheBibleExplanation,
} from "../utils/offline-bible-cache";

// Common explanation types - extend this list as needed
const EXPLANATION_TYPES = ["summary", "commentary", "devotional", "historical"];

// Function to check React Query cache for existing explanations
function getCachedExplanationsFromQuery(
  queryClient: QueryClient,
  bookId: number,
  chapterNumber: number,
): Array<{ type: string; data: any }> {
  const cachedExplanations: Array<{ type: string; data: any }> = [];

  for (const explanationType of EXPLANATION_TYPES) {
    const queryKey = ["explanation", bookId, chapterNumber, explanationType];
    const cachedData = queryClient.getQueryData(queryKey);

    if (cachedData) {
      cachedExplanations.push({
        type: explanationType,
        data: cachedData,
      });
    }
  }

  return cachedExplanations;
}

// Hook for managing offline book downloads
export function useOfflineBookManager() {
  const [downloadProgress, setDownloadProgress] = useState<{
    [bookId: number]: number;
  }>({});
  const queryClient = useQueryClient();
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
        // Count total cached explanations to estimate total work
        let totalCachedExplanations = 0;
        if (queryClient) {
          for (let chapter = 1; chapter <= totalChapters; chapter++) {
            const cachedExplanations = getCachedExplanationsFromQuery(
              queryClient,
              bookId,
              chapter,
            );
            totalCachedExplanations += cachedExplanations.length;
          }
        }

        // Total items to process: chapters + cached explanations
        const totalItems = totalChapters + totalCachedExplanations;
        let completedItems = 0;

        console.log(
          `📚 Starting download: ${totalChapters} chapters + ${totalCachedExplanations} cached explanations`,
        );

        for (let chapter = 1; chapter <= totalChapters; chapter++) {
          // Download and cache chapter
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

          completedItems++;
          const progress = Math.round((completedItems / totalItems) * 100);
          setDownloadProgress((prev) => ({ ...prev, [bookId]: progress }));

          // Check for cached explanations in React Query and persist them
          if (queryClient) {
            const cachedExplanations = getCachedExplanationsFromQuery(
              queryClient,
              bookId,
              chapter,
            );

            for (const { type, data } of cachedExplanations) {
              try {
                // Create explanation format for IndexedDB
                const explanationToCache = {
                  bookId,
                  chapterNumber: chapter,
                  explanations: [data], // Wrap single explanation in array
                  cachedAt: Date.now(),
                };

                await cacheBibleExplanation(explanationToCache);
                console.log(
                  `💾 Cached ${type} explanation for chapter ${chapter}`,
                );

                completedItems++;
                const updatedProgress = Math.round(
                  (completedItems / totalItems) * 100,
                );
                setDownloadProgress((prev) => ({
                  ...prev,
                  [bookId]: updatedProgress,
                }));
              } catch (explanationError) {
                console.warn(
                  `Failed to cache ${type} explanation for chapter ${chapter}:`,
                  explanationError,
                );
              }
            }
          }
        }
      } catch (error) {
        console.error("Error downloading book for offline:", error);
        throw error;
      } finally {
        setIsDownloading(false);
        setDownloadProgress((prev) => ({ ...prev, [bookId]: 100 }));
      }
    },
    [queryClient],
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
