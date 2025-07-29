import { useCallback, useEffect, useState } from "react";

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
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(globalBookmarks);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mock data for testing
  const mockBookmarks: Bookmark[] = [
    {
      id: "1",
      user_id: "user1",
      book_id: 1,
      chapter_number: 1,
      book_name: "Genesis",
      testament: "Old Testament",
      created_at: new Date().toISOString(),
      type: "bookmark",
    },
    {
      id: "2",
      user_id: "user1",
      book_id: 19,
      chapter_number: 23,
      book_name: "Psalms",
      testament: "Old Testament",
      created_at: new Date().toISOString(),
      type: "bookmark",
    },
    {
      id: "3",
      user_id: "user1",
      book_id: 43,
      chapter_number: 3,
      book_name: "John",
      testament: "New Testament",
      created_at: new Date().toISOString(),
      type: "bookmark",
    },
  ];

  // biome-ignore lint/correctness/useExhaustiveDependencies: The dependency array is intentionally left empty to prevent infinite re-renders
  const fetchBookmarks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      // In a real implementation, this would be an API call
      // const response = await fetch('/api/bookmarks');
      // const data = await response.json();
      // setBookmarks(data);

      // For now, use mock data
      if (globalBookmarks.length === 0) {
        globalBookmarks = [...mockBookmarks];
      }
      setBookmarks(globalBookmarks);
      console.log("Fetched bookmarks:", globalBookmarks);
    } catch (err) {
      console.error("Error fetching bookmarks:", err);
      setError("Failed to fetch bookmarks");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addBookmark = useCallback(
    async (
      bookId: number,
      chapterNumber: number,
      bookName: string,
      testament: string,
    ) => {
      try {
        console.log("Adding bookmark:", {
          bookId,
          chapterNumber,
          bookName,
          testament,
        });

        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 300));

        // In a real implementation, this would be an API call
        // const response = await fetch('/api/bookmarks', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ bookId, chapterNumber, bookName, testament }),
        // });
        // const newBookmark = await response.json();

        // For now, create a mock bookmark
        const newBookmark: Bookmark = {
          id: Date.now().toString(),
          user_id: "user1",
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
      } catch (err) {
        console.error("Error adding bookmark:", err);
        setError("Failed to add bookmark");
        throw err;
      }
    },
    [],
  );

  const removeBookmark = useCallback(
    async (bookId: number, chapterNumber: number) => {
      try {
        console.log("Removing bookmark:", { bookId, chapterNumber });

        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 300));

        // In a real implementation, this would be an API call
        // await fetch(`/api/bookmarks/${bookmarkId}`, {
        //   method: 'DELETE',
        // });

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
      } catch (err) {
        console.error("Error removing bookmark:", err);
        setError("Failed to remove bookmark");
        throw err;
      }
    },
    [],
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

  // Initial fetch
  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  return {
    bookmarks,
    isLoading,
    error,
    addBookmark,
    removeBookmark,
    isBookmarked,
  };
};
