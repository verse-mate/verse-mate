"use client";

import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useCallback, useEffect, useState } from "react";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

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
  const {
    selectedTab,
    setSelectedTab,
    selectedBook,
    selectedVerse,
    handleTabChange,
    handleVerseSelect,
    handleBibleVersionSelect,
    selectedBibleVersion,
  } = useSelectedState(setIsOpen);

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

  // **Filter logic**: if there's any filter text, match by name across both testaments;
  // otherwise, show only books in the selectedTab.
  const filteredTestaments: Testament[] =
    testaments?.filter((t) => {
      const nameMatches = t.n
        .toLowerCase()
        .includes(debouncedFilter.toLowerCase());
      const tabMatches = t.t === selectedTab;
      return debouncedFilter ? nameMatches : tabMatches;
    }) ?? [];

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

export const useSelectedState = (setIsOpen: (open: boolean) => void) => {
  const [selectedTab, setSelectedTab] = useState<"OT" | "NT">("NT");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<string | null>(null);
  const [selectedBibleVersion, setSelectedBibleVersion] = useState<
    string | null
  >(null);
  const { saveSearchParams, saveBibleVersionOnURL } = useSaveSearchParams();

  const handleTabChange = useCallback((value: string) => {
    setSelectedTab(value as "OT" | "NT");
  }, []);

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
    },
    [setIsOpen, saveSearchParams],
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
