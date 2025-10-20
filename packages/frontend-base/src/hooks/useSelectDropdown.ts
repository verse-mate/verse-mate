"use client";

import { api } from "backend-api";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useCallback, useEffect, useMemo, useState } from "react";
import { filterBibleBooks } from "../utils/search";
import { useSaveSearchParams } from "./useSearchParams";
import { userSession } from "./userSession";

type Testament = {
  b: number;
  c: number;
  n: string;
  t: string;
  g: number;
};

type Testaments = Testament[] | undefined;

type RecentlyViewedBook = {
  bookId: string;
  timestamp: number;
};

export const useSelectDropdown = (testaments?: Testaments) => {
  const { filter, handleChange, resetFilter } = useFilter();
  const debouncedFilter = useDebounce(filter, 0);
  const { isOpen, setIsOpen, toggleDropdown } = useDropdownToggle();
  const [recentlyViewedBooks, setRecentlyViewedBooks] = useState<string[]>([]);
  const { session } = userSession();

  // Load from localStorage and sync with backend on mount
  useEffect(() => {
    const loadAndSyncRecentlyViewed = async () => {
      // Load from localStorage first (instant display)
      const storedBooksRaw =
        localStorage.getItem("recentlyViewedBooks") || "[]";
      let localBooks: RecentlyViewedBook[] = [];

      try {
        const parsed = JSON.parse(storedBooksRaw);

        // Handle old format (array of strings) - migrate to new format
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (typeof parsed[0] === "string") {
            // Old format: convert to new format with current timestamp
            localBooks = parsed.map((bookId: string) => ({
              bookId,
              timestamp: Date.now(),
            }));
            // Save back in new format
            localStorage.setItem(
              "recentlyViewedBooks",
              JSON.stringify(localBooks),
            );
          } else {
            // New format already
            localBooks = parsed;
          }
        }

        // Set state immediately for instant display
        setRecentlyViewedBooks(localBooks.map((b) => b.bookId));

        // If user is authenticated, sync with backend
        if (session?.id) {
          try {
            const response = await api.user["recently-viewed-books"].sync.post({
              books: localBooks,
            });

            if (response.data && !response.error) {
              const mergedBookIds = response.data.bookIds;

              // Update localStorage with merged data
              const mergedBooks: RecentlyViewedBook[] = mergedBookIds.map(
                (bookId) => {
                  const localBook = localBooks.find((b) => b.bookId === bookId);
                  return {
                    bookId,
                    timestamp: localBook?.timestamp || Date.now(),
                  };
                },
              );

              localStorage.setItem(
                "recentlyViewedBooks",
                JSON.stringify(mergedBooks),
              );
              setRecentlyViewedBooks(mergedBookIds);
            }
          } catch (error) {
            console.error("Failed to sync recently viewed books:", error);
            // Continue with local data on error
          }
        }
      } catch (error) {
        console.error("Failed to parse recently viewed books:", error);
        setRecentlyViewedBooks([]);
      }
    };

    loadAndSyncRecentlyViewed();
  }, [session?.id]);

  const {
    selectedTab,
    setSelectedTab,
    selectedBook,
    selectedVerse,
    handleTabChange,
    handleVerseSelect,
    handleBibleVersionSelect,
    selectedBibleVersion,
  } = useSelectedState(setIsOpen, resetFilter, setRecentlyViewedBooks, session);

  // Reset filter when navigation changes (book or chapter)
  useEffect(() => {
    if (selectedBook || selectedVerse) {
      resetFilter();
    }
  }, [selectedBook, selectedVerse, resetFilter]);

  // Debugging — you can remove this later
  useEffect(() => {
    console.log({
      debouncedFilter,
      selectedTab,
      testamentsSample: testaments?.slice(0, 3),
    });
  }, [debouncedFilter, selectedTab, testaments]);

  const filteredTestaments: Testament[] = useMemo(() => {
    if (!testaments) return [];
    return filterBibleBooks(testaments, debouncedFilter);
  }, [testaments, debouncedFilter]);
  // Just the names, for backwards compatibility
  const filteredBooks: string[] = filteredTestaments.map((t) => t.n);

  return {
    isOpen,
    selectedBook,
    selectedVerse,
    selectedTab,
    setSelectedTab,
    debouncedFilter,
    setIsOpen,
    handleChange,
    handleTabChange,
    handleVerseSelect,
    filteredTestaments,
    filteredBooks,
    handleBibleVersionSelect,
    selectedBibleVersion,
    toggleDropdown,
    resetFilter,
    recentlyViewedBooks,
  };
};

export const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

export const useFilter = (onReset?: () => void) => {
  const [filter, setFilter] = useState("");

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFilter(event.target.value);
    },
    [],
  );

  const resetFilter = useCallback(() => {
    setFilter("");
    onReset?.();
  }, [onReset]);

  return { filter, handleChange, resetFilter };
};

export const useSelectedState = (
  setIsOpen: (open: boolean) => void,
  resetFilter: () => void,
  setRecentlyViewedBooks: (books: string[]) => void,
  session: ReturnType<typeof userSession>["session"],
) => {
  const [selectedTab, setSelectedTab] = useState<"OT" | "NT" | "TOPICS">("NT");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<string | null>(null);
  const [selectedBibleVersion, setSelectedBibleVersion] = useState<
    string | null
  >(null);
  const { saveSearchParams, saveBibleVersionOnURL } = useSaveSearchParams();

  const handleTabChange = useCallback(
    (value: string) => {
      setSelectedTab(value as "OT" | "NT" | "TOPICS");
      if (resetFilter) {
        resetFilter();
      }
    },
    [resetFilter],
  );

  const handleVerseSelect = useCallback(
    (
      bookId: string,
      bookName: string,
      verseId: string,
      testament: TestamentEnum,
    ) => {
      setSelectedBook(bookName);
      setSelectedVerse(verseId);
      setIsOpen(false);
      saveSearchParams({ bookId, verseId, testament });

      // Save to recently viewed with timestamp
      const storedBooksRaw =
        localStorage.getItem("recentlyViewedBooks") || "[]";
      let recentlyViewed: RecentlyViewedBook[] = [];

      try {
        const parsed = JSON.parse(storedBooksRaw);
        // Handle both old and new format
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (typeof parsed[0] === "string") {
            recentlyViewed = parsed.map((id: string) => ({
              bookId: id,
              timestamp: Date.now(),
            }));
          } else {
            recentlyViewed = parsed;
          }
        }
      } catch (error) {
        console.error("Failed to parse recently viewed books:", error);
      }

      // Add new book at the front with current timestamp
      const newBook: RecentlyViewedBook = {
        bookId,
        timestamp: Date.now(),
      };

      const newRecentlyViewed = [
        newBook,
        ...recentlyViewed.filter((book) => book.bookId !== bookId),
      ].slice(0, 4);

      localStorage.setItem(
        "recentlyViewedBooks",
        JSON.stringify(newRecentlyViewed),
      );
      setRecentlyViewedBooks(newRecentlyViewed.map((b) => b.bookId));

      // Sync with backend if authenticated (fire and forget)
      if (session?.id) {
        api.user["recently-viewed-books"].sync
          .post({
            books: [newBook],
          })
          .catch((error) => {
            console.error("Failed to sync recently viewed book:", error);
          });
      }
    },
    [setIsOpen, saveSearchParams, setRecentlyViewedBooks, session?.id],
  );

  const handleBibleVersionSelect = useCallback(
    (version: string) => {
      setSelectedBibleVersion(version);
      saveBibleVersionOnURL(version);
    },
    [saveBibleVersionOnURL],
  );

  return {
    selectedTab,
    setSelectedTab,
    selectedBook,
    selectedVerse,
    handleTabChange,
    handleVerseSelect,
    handleBibleVersionSelect,
    selectedBibleVersion,
  };
};

export const useDropdownToggle = () => {
  const [isOpen, setIsOpen] = useState(false);
  const toggleDropdown = () => setIsOpen((o) => !o);
  const closeDropdown = () => setIsOpen(false);
  return { isOpen, setIsOpen, toggleDropdown, closeDropdown };
};

type ArrayFilter = { key: string; value: string }[];

export const useArrayFilter = (array: ArrayFilter) => {
  const { filter, handleChange } = useFilter();
  const debouncedFilter = useDebounce(filter, 0);
  const filteredArray = array.filter((item) =>
    item.value.toLowerCase().includes(debouncedFilter.toLowerCase()),
  );
  return { debouncedFilter, handleChange, filteredArray };
};
