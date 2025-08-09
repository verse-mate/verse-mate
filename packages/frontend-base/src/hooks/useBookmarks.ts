import { $env } from "frontend-envs";
import { useCallback, useEffect, useState } from "react";
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
  } catch (error) {
    console.error("Error reading pending bookmarks from localStorage:", error);
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
  } catch (error) {
    console.error("Error saving pending bookmarks to localStorage:", error);
  }
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

  // Debug session info
  useEffect(() => {
    console.log("=== SESSION DEBUG INFO ===");
    console.log("Session:", session);
    console.log("User ID:", session?.id);
    console.log("Email:", session?.email);
    console.log("=========================");
  }, [session]);

  // Get API URL from environment
  const apiUrl = $env.get().apiUrl;

  // Debug logging
  console.log("Original API URL:", apiUrl);

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
        console.error("Cannot add bookmark: User not logged in");
        setError("You must be logged in to add bookmarks");
        return null;
      }

      try {
        console.log("Adding bookmark:", {
          bookId,
          chapterNumber,
          bookName,
          testament,
        });

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

        // Log the raw response for debugging
        console.log("Add bookmark response status:", response.status);

        // Try to get response text even if not JSON
        const responseText = await response.text();
        console.log("Add bookmark response text:", responseText);

        let result: any;
        try {
          // Try to parse as JSON if possible
          result = JSON.parse(responseText);
          console.log("Add bookmark parsed response:", result);
        } catch (e) {
          console.error("Failed to parse response as JSON:", e);
          throw new Error(
            `Error adding bookmark: ${response.status} - ${responseText}`,
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

          // Notify any other components that are listening to this state
          notifyListeners();

          console.log(
            `Added bookmark successfully. New bookmark count: ${updatedBookmarks.length}`,
          );

          return newBookmark;
        }
        throw new Error("Server returned success: false");
      } catch (err) {
        console.error("Error adding bookmark:", err);
        setError("Failed to add bookmark");
        return null;
      }
    },
    [session, getApiPath],
  );

  const removeBookmark = useCallback(
    async (bookId: number, chapterNumber: number) => {
      if (!session) {
        console.error("Cannot remove bookmark: User not logged in");
        setError("You must be logged in to remove bookmarks");
        return;
      }

      try {
        console.log("Removing bookmark:", { bookId, chapterNumber });

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

        // Log the raw response for debugging
        console.log("Remove bookmark response status:", response.status);

        // Try to get response text even if not JSON
        const responseText = await response.text();
        console.log("Remove bookmark response text:", responseText);

        let result: any = { success: false };
        try {
          // Try to parse as JSON if possible
          result = JSON.parse(responseText);
          console.log("Remove bookmark parsed response:", result);
        } catch (e) {
          console.error("Failed to parse response as JSON:", e);
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

        // Notify any other components that are listening to this state
        notifyListeners();

        console.log(
          `Removed bookmark successfully. New bookmark count: ${updatedBookmarks.length}`,
        );

        return result.success;
      } catch (err) {
        console.error("Error removing bookmark:", err);
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
      const storedPendingBookmarks = getPendingBookmarks();
      setBookmarks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(
        `Fetching bookmarks from: ${getApiPath("/book/bookmarks/") + session.id}`,
      );

      // Real API call to get user bookmarks
      const response = await fetch(getApiPath("/book/bookmarks/") + session.id);

      // For debugging production issues - capture detailed error info
      if (!response.ok) {
        console.error(
          `Bookmark API error: ${response.status} ${response.statusText}`,
        );

        // Try to get response body even for error responses
        try {
          const errorText = await response.text();
          console.error(`Bookmark API error body: ${errorText}`);

          // Try parsing as JSON if possible
          try {
            const errorJson = JSON.parse(errorText);
            console.error("Parsed error response:", errorJson);
          } catch (e) {
            // Not JSON, that's fine
          }
        } catch (e) {
          console.error("Could not read error response body");
        }

        throw new Error(`Error fetching bookmarks: ${response.status}`);
      }

      const data = await response.json();

      // Transform the response data to match our Bookmark interface
      const fetchedBookmarks = data.favorites.map((fav: any) => ({
        id: fav.favorite_id,
        user_id: session.id,
        book_id: fav.book_id, // Use the correct field name from backend
        chapter_number: fav.chapter_number, // Use the correct field name from backend
        book_name: fav.book_name, // Use the correct field name from backend
        testament: "", // API might not provide testament directly
        created_at: new Date().toISOString(),
        type: "bookmark" as const,
      }));

      console.log("Raw favorites data from API:", data.favorites);
      console.log("Mapped bookmarks:", fetchedBookmarks);

      // Update global state
      globalBookmarks = fetchedBookmarks;

      // Update local state
      setBookmarks(globalBookmarks);
      console.log("Fetched bookmarks:", globalBookmarks);
    } catch (err) {
      console.error("Error fetching bookmarks:", err);
      setError("Failed to fetch bookmarks");
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, session, getApiPath]);

  // Sync pending bookmarks to backend when user logs in
  useEffect(() => {
    const syncPendingBookmarks = async () => {
      // If user just logged in, check for pending bookmarks
      if (session) {
        const pendingBookmarks = getPendingBookmarks();

        if (pendingBookmarks.length > 0) {
          console.log("Found pending bookmarks to sync:", pendingBookmarks);

          // Add each pending bookmark to the user's account
          for (const bookmark of pendingBookmarks) {
            try {
              await addBookmark(
                bookmark.book_id,
                bookmark.chapter_number,
                bookmark.book_name,
                bookmark.testament,
              );
            } catch (error) {
              console.error("Error syncing pending bookmark:", error);
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
      console.log("Session detected, fetching bookmarks...");
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
