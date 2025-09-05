import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

export const useChapter = () => {
  const queryClient = useQueryClient();
  const { verseId, chapters } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  const handleNextChapter = useCallback(() => {
    const totalChapters = chapters;
    const currentChapter = Number(verseId);

    if (totalChapters && currentChapter < totalChapters) {
      saveSearchParams({
        verseId: String(currentChapter + 1),
      });
    }
  }, [chapters, verseId, saveSearchParams]);

  const handlePreviousChapter = useCallback(() => {
    const currentChapter = Number(verseId);

    if (currentChapter > 1) {
      saveSearchParams({
        verseId: String(currentChapter - 1),
      });
    }
  }, [verseId, saveSearchParams]);

  return {
    handleNextChapter,
    handlePreviousChapter,
  };
};
