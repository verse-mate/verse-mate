"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "vm_viewed_intros";

/**
 * Hook to track which book introductions the user has viewed
 * Uses localStorage for persistence across sessions
 * TODO: Sync with backend API when authentication is implemented
 */
export function useIntroTracking() {
  const [viewedIntros, setViewedIntros] = useState<number[]>([]);

  // Load viewed intros from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setViewedIntros(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error("Error loading viewed intros from localStorage:", error);
      setViewedIntros([]);
    }
  }, []);

  // Check if a book intro has been viewed
  const hasViewed = useCallback(
    (bookId: number): boolean => {
      return viewedIntros.includes(bookId);
    },
    [viewedIntros],
  );

  // Mark a book intro as viewed
  const markAsViewed = useCallback(
    (bookId: number) => {
      if (!viewedIntros.includes(bookId)) {
        const updated = [...viewedIntros, bookId];
        setViewedIntros(updated);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
          console.error("Error saving viewed intro to localStorage:", error);
        }
      }
    },
    [viewedIntros],
  );

  // Clear all viewed intros (for testing/debugging)
  const clearViewed = useCallback(() => {
    setViewedIntros([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Error clearing viewed intros from localStorage:", error);
    }
  }, []);

  return {
    hasViewed,
    markAsViewed,
    clearViewed,
    viewedIntros,
  };
}
