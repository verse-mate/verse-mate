"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type BookIntroduction,
  getBookIntroduction as fetchBookIntroduction,
  markIntroductionAsViewed as markViewed,
} from "../api/book-introduction";

const STORAGE_KEY = "book-intros-viewed";

// Simple in-memory cache so we don't JSON.parse localStorage on every render.
// All hook instances share this cache.
let viewedCache: number[] | null = null;

/**
 * Get viewed book IDs from localStorage for non-logged-in users
 */
function getViewedIntrosFromStorage(): number[] {
  if (typeof window === "undefined") return [];

  // Use cached value if available
  if (viewedCache) return viewedCache;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      viewedCache = [];
      return viewedCache;
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      // Legacy or corrupted format, clear it
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    // Normalize to numeric book IDs to avoid string/number mismatch issues
    viewedCache = parsed
      .map((value) => Number(value))
      .filter((n) => Number.isFinite(n) && n > 0);
    return viewedCache;
  } catch (error) {
    console.error("Failed to read viewed intros from localStorage:", error);
    // Clear corrupted data
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore cleanup errors
    }
    viewedCache = [];
    return viewedCache;
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
      const next = [...viewed, bookId];
      viewedCache = next;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch (error) {
    console.error("Failed to save viewed intro to localStorage:", error);
    // Check if it's a quota exceeded error
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn(
        "localStorage quota exceeded. Viewed intros will not persist.",
      );
    }
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
  const hasViewed = !!(
    data?.hasViewed ||
    (bookId && getViewedIntrosFromStorage().includes(bookId))
  );

  // Mark as viewed function that works for both logged-in and non-logged-in users
  const markAsViewed = (bookId: number, isLoggedIn: boolean) => {
    // Optimistically update localStorage immediately to prevent race condition
    markIntroAsViewedInStorage(bookId);

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
