import { api } from "backend-api";

/**
 * Cache for chapter IDs to avoid repeated API calls
 */
const chapterIdCache = new Map<string, number | null>();

/**
 * Get the chapter ID for a given book ID and chapter number from the API
 * Includes caching to improve performance for repeated lookups
 */
export async function getChapterId(
  bookId: number,
  chapterNumber: number,
): Promise<number | null> {
  const cacheKey = `${bookId}-${chapterNumber}`;

  // Check cache first
  if (chapterIdCache.has(cacheKey)) {
    return chapterIdCache.get(cacheKey) || null;
  }

  try {
    console.log(
      `Fetching chapter_id for book ${bookId}, chapter ${chapterNumber}`,
    );

    // Call the new API endpoint
    const response = await (api.bible as any)["chapter-id"][bookId][
      chapterNumber
    ].get();

    if (response.error) {
      throw response.error;
    }

    if (response.data && response.data.chapter_id !== null) {
      const chapterId = response.data.chapter_id;
      console.log(
        `Got chapter_id ${chapterId} for book ${bookId}, chapter ${chapterNumber}`,
      );

      // Cache the result
      chapterIdCache.set(cacheKey, chapterId);
      return chapterId;
    }
    console.warn(
      `No chapter_id found for book ${bookId}, chapter ${chapterNumber}`,
    );

    // Cache null result to avoid repeated failed calls
    chapterIdCache.set(cacheKey, null);
    return null;
  } catch (error) {
    console.error(
      `Error fetching chapter_id for book ${bookId}, chapter ${chapterNumber}:`,
      error,
    );

    // Don't cache errors, allow retry on next call
    return null;
  }
}

/**
 * Clear the chapter ID cache (useful for testing or when data changes)
 */
export function clearChapterIdCache(): void {
  chapterIdCache.clear();
}
