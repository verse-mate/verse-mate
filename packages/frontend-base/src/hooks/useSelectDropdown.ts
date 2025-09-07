"use client";

import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useCallback, useEffect, useMemo, useState } from "react";
import { filterBibleBooks } from "../utils/search";
import { useSaveSearchParams } from "./useSearchParams";

type Testament = {
  b: number;
  c: number;
  n: string;
  t: string;
  g: number;
};

type Testaments = Testament[] | undefined;

export const useSelectDropdown = (testaments?: Testaments) => {
  const { filter, handleChange, resetFilter } = useFilter();
  const debouncedFilter = useDebounce(filter, 0);
  const { isOpen, setIsOpen, toggleDropdown } = useDropdownToggle();
  const [recentlyViewedBooks, setRecentlyViewedBooks] = useState<string[]>([]);

  useEffect(() => {
    const storedBooks = JSON.parse(
      localStorage.getItem("recentlyViewedBooks") || "[]",
    );
    setRecentlyViewedBooks(storedBooks);
  }, []);

  const {
    selectedTab,
    setSelectedTab,
    selectedBook,
    selectedVerse,
    handleTabChange,
    handleVerseSelect,
    handleBibleVersionSelect,
    selectedBibleVersion,
  } = useSelectedState(setIsOpen, resetFilter, setRecentlyViewedBooks);

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
) => {
  const [selectedTab, setSelectedTab] = useState<"OT" | "NT">("NT");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<string | null>(null);
  const [selectedBibleVersion, setSelectedBibleVersion] = useState<
    string | null
  >(null);
  const { saveSearchParams, saveBibleVersionOnURL } = useSaveSearchParams();

  const handleTabChange = useCallback(
    (value: string) => {
      setSelectedTab(value as "OT" | "NT");
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

      // Save to recently viewed
      const recentlyViewed = JSON.parse(
        localStorage.getItem("recentlyViewedBooks") || "[]",
      );
      const newRecentlyViewed = [
        bookId,
        ...recentlyViewed.filter((id: string) => id !== bookId),
      ].slice(0, 6);
      localStorage.setItem(
        "recentlyViewedBooks",
        JSON.stringify(newRecentlyViewed),
      );
      setRecentlyViewedBooks(newRecentlyViewed);
    },
    [setIsOpen, saveSearchParams, setRecentlyViewedBooks],
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
