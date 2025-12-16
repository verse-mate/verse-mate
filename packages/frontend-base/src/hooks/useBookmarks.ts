import { $env } from "frontend-envs";
import { useCallback, useEffect, useState } from "react";
import { AnalyticsEvent, analytics } from "../analytics";
import { userSession } from "../hooks/userSession";

export interface Bookmark {
  id: string;
  user_id: string;
  book_id: number;
  chapter_number: number;
  book_name: string;
  testament: string;
  created_at: string;
  type: "bookmark";
}

// Backend API response types
interface BookmarkApiResponse {
  favorite_id: string;
  book_id: number;
  chapter_number: number;
  book_name: string;
}

interface BookmarksApiResponse {
  favorites: BookmarkApiResponse[];
}

// Local storage key for pending bookmarks
const PENDING_BOOKMARKS_KEY = "verse-mate-pending-bookmarks";

// Create a singleton state that can be shared across components
let globalBookmarks: Bookmark[] = [];
// biome-ignore lint/complexity/noBannedTypes: Using Function[] is necessary for the notifyListeners functionality
let listeners: Function[] = [];

const notifyListeners = () => {
  listeners.forEach((listener) => listener(globalBookmarks));
};

// Helper functions for working with pending bookmarks in localStorage
const getPendingBookmarks = (): Array<{
  book_id: number;
  chapter_number: number;
  book_name: string;
  testament: string;
}> => {
  try {
    const stored = localStorage.getItem(PENDING_BOOKMARKS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const savePendingBookmarks = (
  bookmarks: Array<{
    book_id: number;
    chapter_number: number;
    book_name: string;
    testament: string;
  }>,
): void => {
  try {
    localStorage.setItem(PENDING_BOOKMARKS_KEY, JSON.stringify(bookmarks));
  } catch {}
};

// Add a chapter to pending bookmarks
const addToPendingBookmarks = (
  bookId: number,
  chapterNumber: number,
  bookName: string,
  testament: string,
): void => {
  const pendingBookmarks = getPendingBookmarks();

  // Check if this chapter is already in pending bookmarks
  const exists = pendingBookmarks.some(
    (bookmark) =>
      bookmark.book_id === bookId && bookmark.chapter_number === chapterNumber,
  );

  if (!exists) {
    pendingBookmarks.push({
      book_id: bookId,
      chapter_number: chapterNumber,
      book_name: bookName,
      testament,
    });
    savePendingBookmarks(pendingBookmarks);
  }
};

export const useBookmarks = () => {
  const { session } = userSession();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(globalBookmarks);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get API URL from environment
  const apiUrl = $env.get().apiUrl;

  // Helper to get full API path
  const getApiPath = useCallback(
    (path: string) => {
      return `${apiUrl}/bible${path}`;
    },
    [apiUrl],
  );

  // Define addBookmark first, before it's used in any useEffect
  const addBookmark = useCallback(
    async (
      bookId: number,
      chapterNumber: number,
      bookName: string,
      testament: string,
    ) => {
      if (!session) {
        setError("You must be logged in to add bookmarks");
        return null;
      }

      try {
        // Create an object that will be added to both local state and sent to API
        const bookmarkData = {
          user_id: session.id,
          book_id: bookId,
          chapter_number: chapterNumber,
          book_name: bookName,
          testament,
        };

        // Real API call to add a bookmark
        const response = await fetch(getApiPath("/book/bookmark/add"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bookmarkData),
        });

        let result: { success: boolean };
        try {
          // Try to parse as JSON if possible
          result = JSON.parse(await response.text());
        } catch {
          throw new Error(
            `Error adding bookmark: ${response.status} - ${await response.text()}`,
          );
        }

        if (!response.ok) {
          throw new Error(
            `Error adding bookmark: ${response.status} - ${JSON.stringify(result)}`,
          );
        }

        if (result.success) {
          // Create bookmark object for local state
          const newBookmark: Bookmark = {
            id: `${bookId}-${chapterNumber}`, // Temporary ID until refresh
            user_id: session.id,
            book_id: bookId,
            chapter_number: chapterNumber,
            book_name: bookName,
            testament,
            created_at: new Date().toISOString(),
            type: "bookmark",
          };

          // Update both global and local state
          const updatedBookmarks = [...globalBookmarks, newBookmark];
          globalBookmarks = updatedBookmarks;
          setBookmarks(updatedBookmarks);

          // Track BOOKMARK_ADDED event
          analytics.track(AnalyticsEvent.BOOKMARK_ADDED, {
            bookId,
            bookName,
            chapterNumber,
            // Note: bookmarks are at chapter level, not verse level
            // Using 0 to indicate chapter-level bookmark
            verseNumber: 0,
          });

          // Notify any other components that are listening to this state
          notifyListeners();

          return newBookmark;
        }
        throw new Error("Server returned success: false");
      } catch {
        setError("Failed to add bookmark");
        return null;
      }
    },
    [session, getApiPath],
  );

  const removeBookmark = useCallback(
    async (bookId: number, chapterNumber: number) => {
      if (!session) {
        setError("You must be logged in to remove bookmarks");
        return;
      }

      // Get bookmark info for analytics before removing
      const bookmarkToRemove = globalBookmarks.find(
        (bookmark) =>
          bookmark.book_id === bookId &&
          bookmark.chapter_number === chapterNumber,
      );

      try {
        // Prepare query parameters for the DELETE request
        const queryParams = new URLSearchParams({
          user_id: session.id,
          book_id: bookId.toString(),
          chapter_number: chapterNumber.toString(),
        });

        // Real API call to remove a bookmark using query parameters
        const response = await fetch(
          `${getApiPath("/book/bookmark/remove")}?${queryParams.toString()}`,
          {
            method: "DELETE",
          },
        );

        // Try to get response text even if not JSON
        const responseText = await response.text();

        let result: { success: boolean } = { success: false };
        try {
          // Try to parse as JSON if possible
          result = JSON.parse(responseText);
        } catch {
          // If we couldn't parse as JSON but response was ok, assume success
          if (response.ok) {
            result = { success: true };
          }
        }

        if (!response.ok) {
          throw new Error(
            `Error removing bookmark: ${response.status} - ${responseText}`,
          );
        }

        // Update global and local state
        const updatedBookmarks = globalBookmarks.filter(
          (bookmark) =>
            !(
              bookmark.book_id === bookId &&
              bookmark.chapter_number === chapterNumber
            ),
        );
        globalBookmarks = updatedBookmarks;
        setBookmarks(updatedBookmarks);

        // Track BOOKMARK_REMOVED event
        analytics.track(AnalyticsEvent.BOOKMARK_REMOVED, {
          bookId,
          bookName: bookmarkToRemove?.book_name || "",
          chapterNumber,
          verseNumber: 0,
        });

        // Notify any other components that are listening to this state
        notifyListeners();

        return result.success;
      } catch {
        setError("Failed to remove bookmark");
        return false;
      }
    },
    [session, getApiPath],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: The dependency array is intentionally left empty to prevent infinite re-renders
  const fetchBookmarks = useCallback(async () => {
    if (!session) {
      // For non-logged in users, use only pending bookmarks from localStorage
      setBookmarks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Real API call to get user bookmarks
      const response = await fetch(getApiPath("/book/bookmarks/") + session.id);

      // For debugging production issues - capture detailed error info
      if (!response.ok) {
        throw new Error(`Error fetching bookmarks: ${response.status}`);
      }

      const data: BookmarksApiResponse = await response.json();

      // Transform the response data to match our Bookmark interface
      const fetchedBookmarks: Bookmark[] = data.favorites.map((fav) => ({
        id: fav.favorite_id,
        user_id: session.id,
        book_id: fav.book_id,
        chapter_number: fav.chapter_number,
        book_name: fav.book_name,
        testament: "",
        created_at: new Date().toISOString(),
        type: "bookmark" as const,
      }));

      // Update global state
      globalBookmarks = fetchedBookmarks;

      // Update local state
      setBookmarks(globalBookmarks);
    } catch {
      setError("Failed to fetch bookmarks");
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, session, getApiPath]);

  // Sync pending bookmarks to backend when user logs in
  useEffect(() => {
    const syncPendingBookmarks = async () => {
      // If user just logged in, check for pending bookmarks
      if (session?.id) {
        const pendingBookmarks = getPendingBookmarks();

        if (pendingBookmarks.length > 0) {
          // Add each pending bookmark to the user's account
          for (const bookmark of pendingBookmarks) {
            try {
              await addBookmark(
                bookmark.book_id,
                bookmark.chapter_number,
                bookmark.book_name,
                bookmark.testament,
              );
            } catch {
              // Error syncing pending bookmark
            }
          }

          // Clear pending bookmarks after successful sync
          savePendingBookmarks([]);
        }
      }
    };

    syncPendingBookmarks();
  }, [session, addBookmark]);

  const isBookmarked = useCallback(
    (bookId: number, chapterNumber: number) => {
      return globalBookmarks.some(
        (bookmark) =>
          bookmark.book_id === bookId &&
          bookmark.chapter_number === chapterNumber,
      );
    },
    [], // No dependencies needed since we're using the global variable
  );

  // Subscribe to changes
  useEffect(() => {
    // Add this component's setState as a listener
    const listener = (newBookmarks: Bookmark[]) => {
      setBookmarks(newBookmarks);
    };
    listeners.push(listener);

    return () => {
      // Clean up by removing the listener when the component unmounts
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  // Load bookmarks on initial render or when session/user changes
  useEffect(() => {
    if (session) {
      fetchBookmarks();
    }
  }, [fetchBookmarks, session]);

  // Add chapter to pending bookmarks for non-logged in users
  const savePendingBookmark = useCallback(
    (
      bookId: number,
      chapterNumber: number,
      bookName: string,
      testament: string,
    ) => {
      addToPendingBookmarks(bookId, chapterNumber, bookName, testament);
    },
    [],
  );

  return {
    bookmarks,
    isLoading,
    error,
    fetchBookmarks,
    addBookmark,
    removeBookmark,
    isBookmarked,
    savePendingBookmark, // New function for non-logged in users
  };
};
