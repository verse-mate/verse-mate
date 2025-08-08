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

// Create a singleton state that can be shared across components
let globalBookmarks: Bookmark[] = [];
// biome-ignore lint/complexity/noBannedTypes: Using Function[] is necessary for the notifyListeners functionality
let listeners: Function[] = [];

const notifyListeners = () => {
  listeners.forEach((listener) => listener(globalBookmarks));
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: The dependency array is intentionally left empty to prevent infinite re-renders
  const fetchBookmarks = useCallback(async () => {
    if (!session?.id) {
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
  }, [apiUrl, session?.id]);

  const addBookmark = useCallback(
    async (
      bookId: number,
      chapterNumber: number,
      bookName: string,
      testament: string,
    ) => {
      if (!session?.id) {
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

          // Update global state
          globalBookmarks = [...globalBookmarks, newBookmark];

          // Update local state
          setBookmarks(globalBookmarks);

          // Notify all listeners
          notifyListeners();

          console.log("Updated bookmarks after add:", globalBookmarks);
          return newBookmark;
        }

        throw new Error("Failed to add bookmark");
      } catch (err) {
        console.error("Error adding bookmark:", err);
        setError("Failed to add bookmark");
        throw err;
      }
    },
    [session?.id, getApiPath],
  );

  const removeBookmark = useCallback(
    async (bookId: number, chapterNumber: number) => {
      if (!session?.id) {
        console.error("Cannot remove bookmark: User not logged in");
        setError("You must be logged in to remove bookmarks");
        return;
      }

      try {
        const payload = {
          user_id: session.id,
          book_id: bookId,
          chapter_number: chapterNumber,
        };

        console.log("Removing bookmark - payload:", payload);

        // Use query parameters instead of body for more reliable DELETE handling
        const params = new URLSearchParams({
          user_id: session.id,
          book_id: bookId.toString(),
          chapter_number: chapterNumber.toString(),
        });

        // Use regular DELETE with query parameters
        const response = await fetch(
          `${getApiPath("/book/bookmark/remove")}?${params.toString()}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            // No body needed as we're using query parameters
          },
        );

        // Log response status for debugging
        console.log("Remove bookmark response status:", response.status);
        const responseText = await response.text();
        console.log("Remove bookmark response text:", responseText);

        let result: any;
        try {
          // Try to parse as JSON if possible
          result = responseText ? JSON.parse(responseText) : { success: false };
          console.log("Remove bookmark parsed response:", result);
        } catch (e) {
          console.error("Failed to parse response as JSON:", e);
          throw new Error(
            `Error removing bookmark: ${response.status} - ${responseText}`,
          );
        }

        if (!response.ok) {
          throw new Error(`Error removing bookmark: ${response.status}`);
        }

        if (result.success) {
          // Update global state
          globalBookmarks = globalBookmarks.filter(
            (bookmark) =>
              !(
                bookmark.book_id === bookId &&
                bookmark.chapter_number === chapterNumber
              ),
          );

          // Update local state
          setBookmarks(globalBookmarks);

          // Notify all listeners
          notifyListeners();

          console.log("Updated bookmarks after remove:", globalBookmarks);
        } else {
          throw new Error("Failed to remove bookmark");
        }
      } catch (err) {
        console.error("Error removing bookmark:", err);
        setError("Failed to remove bookmark");
        throw err;
      }
    },
    [session?.id, getApiPath],
  );

  const isBookmarked = useCallback((bookId: number, chapterNumber: number) => {
    const result = globalBookmarks.some(
      (bookmark) =>
        bookmark.book_id === bookId &&
        bookmark.chapter_number === chapterNumber,
    );
    return result;
  }, []);

  // Subscribe to changes
  useEffect(() => {
    const handleChange = (updatedBookmarks: Bookmark[]) => {
      setBookmarks(updatedBookmarks);
    };

    listeners.push(handleChange);

    return () => {
      listeners = listeners.filter((listener) => listener !== handleChange);
    };
  }, []);

  // Initial fetch - only if user is logged in
  useEffect(() => {
    if (session?.id) {
      fetchBookmarks();
    } else {
      setBookmarks([]);
      setIsLoading(false);
    }
  }, [fetchBookmarks, session?.id]);

  return {
    bookmarks,
    isLoading,
    error,
    addBookmark,
    removeBookmark,
    isBookmarked,
    refetch: fetchBookmarks,
  };
};
