"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  type BookIntroduction,
  getBookIntroduction as fetchBookIntroduction,
  markIntroductionAsViewed as markViewed,
} from "../api/book-introduction";

const STORAGE_KEY = "book-intros-viewed";

/**
 * Get viewed book IDs from localStorage for non-logged-in users
 */
function getViewedIntrosFromStorage(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Add book ID to viewed list in localStorage
 */
function markIntroAsViewedInStorage(bookId: number): void {
  if (typeof window === "undefined") return;
  try {
    const viewed = getViewedIntrosFromStorage();
    if (!viewed.includes(bookId)) {
      viewed.push(bookId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(viewed));
    }
  } catch (error) {
    console.error("Error saving to localStorage:", error);
  }
}

/**
 * Hook to fetch and manage book introductions
 */
export function useBookIntroduction(
  bookId: number | null,
  languageCode = "en",
) {
  const queryClient = useQueryClient();
  const [localStorageViewed, setLocalStorageViewed] = useState<number[]>([]);

  // Load localStorage on mount
  useEffect(() => {
    setLocalStorageViewed(getViewedIntrosFromStorage());
  }, []);

  // Fetch introduction
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["book-introduction", bookId, languageCode],
    queryFn: () => {
      if (bookId === null || bookId <= 0) {
        throw new Error("Invalid bookId");
      }
      return fetchBookIntroduction(bookId, languageCode);
    },
    enabled: bookId !== null && bookId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
  });

  // Mark as viewed mutation (for logged-in users)
  const markAsViewedMutation = useMutation({
    mutationFn: (bookId: number) => markViewed(bookId),
    onSuccess: (_, bookId) => {
      // Invalidate the query to refetch with updated hasViewed status
      queryClient.invalidateQueries({
        queryKey: ["book-introduction", bookId, languageCode],
      });
    },
  });

  // Combined hasViewed: check both backend response and localStorage
  const hasViewed =
    data?.hasViewed || (bookId ? localStorageViewed.includes(bookId) : false);

  // Mark as viewed function that works for both logged-in and non-logged-in users
  const markAsViewed = (bookId: number, isLoggedIn: boolean) => {
    // Optimistically update localStorage immediately to prevent race condition
    markIntroAsViewedInStorage(bookId);
    setLocalStorageViewed(getViewedIntrosFromStorage());

    if (isLoggedIn) {
      // For logged-in users, also call the API
      markAsViewedMutation.mutate(bookId);
    }
  };

  return {
    introduction: data?.introduction || null,
    hasViewed,
    isLoading,
    error,
    refetch,
    markAsViewed,
    isMarkingViewed: markAsViewedMutation.isPending,
  };
}

export type { BookIntroduction };
