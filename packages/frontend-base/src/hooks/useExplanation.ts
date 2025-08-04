import { useQueryClient } from "@tanstack/react-query";
import { api } from "backend-api";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { useCallback } from "react";
import { useOfflineBibleExplanation } from "./useOfflineBibleExplanation";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

// Hook for controlling explanation type changes
export const useExplanationControl = () => {
  const queryClient = useQueryClient();
  const { explanationType } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  const handleValueChange = (value: ExplanationTypeEnum) => {
    saveSearchParams({ explanationType: value });
    queryClient.invalidateQueries({ queryKey: ["explanation"] });
  };

  return {
    explanationType,
    handleValueChange,
  };
};

// Main hook for fetching and caching explanations with offline support
interface UseExplanationOptions {
  bookId: number;
  chapterNumber: number;
  explanationType: string | null;
  enableOffline?: boolean;
}

export function useExplanation({
  bookId,
  chapterNumber,
  explanationType,
  enableOffline = true,
}: UseExplanationOptions) {
  // Create a stable fetch function that doesn't change based on explanationType
  const fetchFunction = useCallback(async () => {
    // Skip fetching if required parameters are missing
    if (!bookId || !chapterNumber) {
      throw new Error("Book ID and chapter number are required");
    }

    const parsedBookId = String(bookId).padStart(2, "0");
    const parsedChapterId = String(chapterNumber).padStart(2, "0");

    const response = await api.bible.book
      .explanation({
        bookId: parsedBookId,
      })({ chapterNumber: parsedChapterId })
      .get();

    // Return all explanations, let the component filter by type
    return response.data?.explanation || [];
  }, [bookId, chapterNumber]); // Remove explanationType from dependencies

  const {
    data: explanationArray,
    loading,
    error,
    isFromCache,
  } = useOfflineBibleExplanation({
    bookId,
    chapterNumber,
    fetchFunction,
    enableOffline,
  });

  // Filter by explanation type after fetching
  const explanation =
    explanationArray?.find((exp: any) => exp.type === explanationType) || null;

  return {
    explanation,
    loading,
    error,
    isFromCache,
  };
}
