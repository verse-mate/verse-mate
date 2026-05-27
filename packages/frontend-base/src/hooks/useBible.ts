import { useQuery } from "@tanstack/react-query";
import { api } from "backend-api";
import { getBookVerse, getExplanation } from "../api/bible";
import {
  preferredLanguageStore,
  resolveExplanationLang,
} from "../store/preferred-language";
import { useStore } from "../utils/use-store";

export const fetchAllTestaments = () => {
  const {
    data: allTestaments,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["allTestaments"],
    queryFn: async () => {
      const response = await api.bible.testaments.get();
      if (response.error) {
        throw response.error;
      }
      return response.data?.testaments;
    },
  });

  if (error) {
    console.log("All testaments error >>", { error });
  }

  return { testaments: allTestaments, isLoading };
};

export const fetchAllChaptersByBook = (bookId?: number | null) => {
  const { data: chapters, isLoading } = useQuery({
    queryKey: ["allChaptersByBook", bookId],
    queryFn: async () => {
      if (!bookId) {
        return 0;
      }
      const response = await api.bible.testaments.get();
      if (response.error) {
        throw response.error;
      }
      const allTestaments = response.data?.testaments;
      const chaptersByBook = allTestaments?.find(
        (testament) => testament.b === bookId,
      );
      return chaptersByBook?.c || 0;
    },
  });
  return { chapters, isLoading };
};

export const fetchBookVerse = (
  bookId: number,
  chapterId: number,
  bibleVersion: string,
) => {
  const {
    data: bookVerseData,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["bookVerse", bookId, chapterId, bibleVersion],
    queryFn: () => getBookVerse(bookId, chapterId, bibleVersion),
  });

  return { bookVerseData, error, isLoading };
};

export const fetchExplanation = (
  bookId: number,
  chapterId: number,
  explanationType?: string,
  bibleVersion?: string,
) => {
  const lang = resolveExplanationLang(useStore(preferredLanguageStore));
  const {
    data: explanation,
    error,
    isFetching,
    isLoading,
  } = useQuery({
    queryKey: [
      "explanation",
      bookId,
      chapterId,
      explanationType,
      bibleVersion,
      lang ?? "automatic",
    ],
    queryFn: () =>
      getExplanation(bookId, chapterId, explanationType, bibleVersion, lang),
    enabled:
      !!bookId &&
      !!chapterId &&
      !Number.isNaN(bookId) &&
      !Number.isNaN(chapterId),
    retry: 2,
    retryDelay: 3000,
  });

  return {
    explanation,
    error: error as Error | null,
    isLoading: isLoading || isFetching,
  };
};
