import { api } from "backend-api";
import { useCallback } from "react";
import { useOfflineBibleChapter } from "./useOfflineBibleChapter";

// Hook for fetching and caching Bible chapters with offline support
interface UseChapterOptions {
  bookId: number;
  chapterNumber: number;
  enableOffline?: boolean;
}

export function useChapter({
  bookId,
  chapterNumber,
  enableOffline = true,
}: UseChapterOptions) {
  // Create fetch function for chapter data
  const fetchFunction = useCallback(async () => {
    // Skip fetching if required parameters are missing
    if (!bookId || !chapterNumber) {
      throw new Error("Book ID and chapter number are required");
    }

    const parsedBookId = String(bookId).padStart(2, "0");
    const parsedChapterId = String(chapterNumber).padStart(2, "0");

    const response = await api.bible
      .book({ bookId: parsedBookId })({ chapterNumber: parsedChapterId })
      .get();

    return response.data?.book;
  }, [bookId, chapterNumber]);

  const { data, loading, error, isFromCache } = useOfflineBibleChapter({
    bookId,
    chapterNumber,
    fetchFunction,
    enableOffline,
  });

  // Return data in the same format as fetchBookVerse for compatibility
  return {
    bookVerseData: data,
    error,
    isLoading: loading,
    isFromCache,
  };
}
