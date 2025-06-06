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
  const { filter, handleChange } = useFilter();
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

  const filteredBooks: string[] =
    testaments
      ?.filter((testament) => testament.t === selectedTab)
      .map((testament) => testament.n)
      .filter((bookName) =>
        bookName.toLowerCase().includes(debouncedFilter.toLowerCase()),
      ) || [];

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
    filteredBooks,
    handleBibleVersionSelect,
    selectedBibleVersion,
  };
};

export const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

export const useFilter = () => {
  const [filter, setFilter] = useState("");

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFilter(event.target.value);
    },
    [],
  );

  return {
    filter,
    handleChange,
  };
};

export const useSelectedState = (setIsOpen: (isOpen: boolean) => void) => {
  const [selectedTab, setSelectedTab] = useState("NT");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<string | null>(null);
  const [selectedTestament, setSelectedTestament] = useState<"OT" | "NT" | "">(
    "",
  );
  const [selectedBibleVersion, setSelectedBibleVersion] = useState<
    string | null
  >(null);
  const { saveSearchParams, saveBibleVersionOnURL } = useSaveSearchParams();

  const handleTabChange = useCallback((value: string) => {
    setSelectedTab(value);
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
      setSelectedTestament(testament);
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

  const toggleDropdown = () => setIsOpen(!isOpen);

  const closeDropdown = () => setIsOpen(false);

  return {
    isOpen,
    setIsOpen,
    toggleDropdown,
    closeDropdown,
  };
};

type ArrayFilter = {
  key: string;
  value: string;
}[];

export const useArrayFilter = (array: ArrayFilter) => {
  const { filter, handleChange } = useFilter();
  const debouncedFilter = useDebounce(filter, 0);

  const filteredArray = array.filter((item) =>
    item.value.toLowerCase().includes(debouncedFilter.toLowerCase()),
  );

  return {
    debouncedFilter,
    handleChange,
    filteredArray,
  };
};
