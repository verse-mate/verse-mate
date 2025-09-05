import { useQueryClient } from "@tanstack/react-query";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

export const useChapter = () => {
  const queryClient = useQueryClient();
  const { verseId, chapters } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  const handleNextChapter = () => {
    const totalChapters = chapters;
    const currentChapter = Number(verseId);

    if (totalChapters && currentChapter < totalChapters) {
      saveSearchParams({
        verseId: String(currentChapter + 1),
      });
    }
  };

  const handlePreviousChapter = () => {
    const currentChapter = Number(verseId);

    if (currentChapter > 1) {
      saveSearchParams({
        verseId: String(currentChapter - 1),
      });
    }
  };

  return {
    handleNextChapter,
    handlePreviousChapter,
  };
};
