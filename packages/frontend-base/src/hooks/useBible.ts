import { useQuery } from "@tanstack/react-query";
import { api } from "backend-api";

export const fetchAllTestaments = () => {
  const {
    data: allTestaments,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["allTestaments"],
    queryFn: async () =>
      (await api.bible.testaments.get()).data?.testaments.keys,
  });

  if (error) {
    console.log("All testaments error >>", { error });
  }

  return { testaments: allTestaments, isLoading };
};

export const fetchAllChaptersByBook = (bookId?: number | null) => {
  const {
    data: chapters,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["allChaptersByBook", bookId],
    queryFn: async () => {
      if (!bookId) {
        return 0;
      }
      const allTestaments = (await api.bible.testaments.get()).data?.testaments
        .keys;
      const chaptersByBook = allTestaments?.find(
        (testament) => testament.b === bookId,
      );
      return chaptersByBook?.c || 0;
    },
  });
  return { chapters, isLoading };
};

export const fetchBookVerse = (bookId: number, chapterId: number) => {
  const parsedBookId = String(bookId).padStart(2, "0");
  const parsedChapterId = String(chapterId).padStart(2, "0");

  const {
    data: bookVerseData,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["bookVerse", bookId, chapterId],
    queryFn: async () =>
      await api.bible
        .book({ bookId: parsedBookId })({ chapterNumber: parsedChapterId })
        .get()
        .then((response) => response.data?.book),
  });

  return { bookVerseData, error, isLoading };
};

export const fetchExplanation = (
  bookId: number,
  chapterId: number,
  explanationType?: string,
  bibleVersion?: string,
) => {
  const parsedBookId = String(bookId).padStart(2, "0");
  const parsedChapterId = String(chapterId).padStart(2, "0");

  const {
    data: explanation,
    error,
    isPending,
    isFetching,
    isLoading,
  } = useQuery({
    queryKey: ["explanation", bookId, chapterId, explanationType, bibleVersion],
    queryFn: async () => {
      console.log("bibleVersion", bibleVersion);

      const response = await api.bible.book
        .explanation({
          bookId: parsedBookId,
        })({ chapterNumber: parsedChapterId })
        .get({
          query: {
            versionKey: bibleVersion,
          },
        });

      const foundExplanation = response.data?.explanation?.find(
        (exp) => exp.type === explanationType,
      );

      try {
        if (!response.data?.explanation) {
          throw new Error("Explanation not found");
        }

        if (!foundExplanation) {
          throw new Error("Explanation type not found");
        }

        return foundExplanation;
      } catch (err) {
        return {
          ...foundExplanation,
          explanation:
            "Failed to generate explanation, maybe the you exceeded your current quota.",
        };
      }
    },
    retry: 2,
    retryDelay: 3000,
  });

  return {
    explanation,
    error: error as Error | null,
    isLoading: isLoading || isFetching,
  };
};
