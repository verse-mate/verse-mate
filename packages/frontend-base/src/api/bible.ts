import { api } from "backend-api";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";

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

  const explanation = response.data?.explanation;

  try {
    if (!explanation) {
      throw new Error("Explanation not found");
    }

    if (explanation.type !== explanationType) {
      return {
        ...explanation,
        explanation: "Explanation type not found for this chapter.",
      };
    }

    return explanation;
  } catch (err) {
    return {
      book_id: bookId,
      chapter_number: chapterId,
      explanation_id: null,
      type: explanationType as ExplanationTypeEnum,
      explanation:
        "Failed to generate explanation, maybe you exceeded your current quota.",
    };
  }
};
