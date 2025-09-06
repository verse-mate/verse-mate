import { api } from "backend-api";

export const getBookVerse = async (
  bookId: number,
  chapterId: number,
  bibleVersion: string,
) => {
  const parsedBookId = String(bookId).padStart(2, "0");
  const parsedChapterId = String(chapterId).padStart(2, "0");
  const versionKey = bibleVersion ?? "NASB1995";
  const response = await api.bible
    .book({ bookId: parsedBookId })({ chapterNumber: parsedChapterId })
    .get({
      query: {
        versionKey,
      },
    });
  return response.data?.book;
};

export const getExplanation = async (
  bookId: number,
  chapterId: number,
  explanationType?: string,
  bibleVersion?: string,
) => {
  const parsedBookId = String(bookId).padStart(2, "0");
  const parsedChapterId = String(chapterId).padStart(2, "0");
  const versionKey = bibleVersion ?? "NASB1995";

  const response = await api.bible.book
    .explanation({
      bookId: parsedBookId,
    })({ chapterNumber: parsedChapterId })
    .get({
      query: {
        versionKey,
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
};
