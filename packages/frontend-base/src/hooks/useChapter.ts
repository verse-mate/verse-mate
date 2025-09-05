import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

export const useChapter = () => {
  const queryClient = useQueryClient();
  const { verseId } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  const currentChapter = Number(verseId);
  const isValidChapter = Number.isFinite(currentChapter) && currentChapter >= 1;

  const handleNextChapter = useCallback(
    (totalChapters?: number) => {
      if (!isValidChapter) return;
      const totalChaptersNum = Number(totalChapters);
      if (!Number.isFinite(totalChaptersNum)) return;
      if (currentChapter < totalChaptersNum) {
        saveSearchParams({ verseId: String(currentChapter + 1) });
      }
    },
    [currentChapter, isValidChapter, saveSearchParams],
  );

  const handlePreviousChapter = useCallback(() => {
    if (!isValidChapter) return;
    if (currentChapter > 1) {
      saveSearchParams({ verseId: String(currentChapter - 1) });
    }
  }, [currentChapter, isValidChapter, saveSearchParams]);

  return {
    handleNextChapter,
    handlePreviousChapter,
  };
};
