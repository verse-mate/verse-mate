import { useCallback } from "react";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

export const useChapter = () => {
  const { verseId, bookId, testament } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  const currentChapter = Number(verseId);
  const isValidChapter = Number.isFinite(currentChapter) && currentChapter >= 1;

  const handleNextChapter = useCallback(
    (totalChapters?: number) => {
      if (!isValidChapter) return;
      const totalChaptersNum = Number(totalChapters);
      if (!Number.isFinite(totalChaptersNum)) return;
      if (currentChapter < totalChaptersNum) {
        saveSearchParams({
          bookId: String(bookId),
          verseId: String(currentChapter + 1),
          testament: String(testament),
          showIntro: false,
        });
      }
    },
    [currentChapter, isValidChapter, saveSearchParams, bookId, testament],
  );

  const handlePreviousChapter = useCallback(() => {
    if (!isValidChapter) return;
    if (currentChapter > 1) {
      saveSearchParams({
        bookId: String(bookId),
        verseId: String(currentChapter - 1),
        testament: String(testament),
        showIntro: false,
      });
    }
  }, [currentChapter, isValidChapter, saveSearchParams, bookId, testament]);

  return {
    handleNextChapter,
    handlePreviousChapter,
  };
};
