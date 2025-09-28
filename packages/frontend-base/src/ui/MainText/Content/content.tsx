import { useEffect, useState } from "react";
import { useHighlights } from "../../../hooks/useHighlights";
import { getChapterId } from "../../../utils/chapter-utils";
import { MainText } from "../index";
import styles from "./content.module.css";
import type { BookVerse, Chapter, ContentProps } from "./types";

export const Content = ({ bookId, verseId, book }: ContentProps) => {
  const { highlights, createHighlight, deleteHighlight, updateHighlightColor } =
    useHighlights(
      Number(bookId),
      undefined, // We'll get highlights for all chapters of this book
    );

  // State to manage chapter IDs for each chapter
  const [chapterIds, setChapterIds] = useState<Record<number, number | null>>(
    {},
  );

  // Load chapter IDs for all chapters in the book
  useEffect(() => {
    if (!book?.chapters || !bookId) return;

    const loadChapterIds = async () => {
      const chapterNumbers = book.chapters.map((ch) => ch.chapterNumber);
      const promises = chapterNumbers.map(async (chapterNumber) => {
        try {
          const chapterId = await getChapterId(Number(bookId), chapterNumber);
          return { chapterNumber, chapterId };
        } catch (error) {
          console.error(
            `Failed to load chapter ID for chapter ${chapterNumber}:`,
            error,
          );
          return { chapterNumber, chapterId: null };
        }
      });

      const results = await Promise.all(promises);

      // Update chapter IDs state with all results at once
      const newChapterIds: Record<number, number | null> = {};
      results.forEach(({ chapterNumber, chapterId }) => {
        newChapterIds[chapterNumber] = chapterId;
      });

      setChapterIds(newChapterIds);
    };

    loadChapterIds();
  }, [book?.chapters, bookId]); // ✅ Fixed: Only depend on book.chapters and bookId

  if (!bookId || !verseId || !book) {
    return <div>Verse not found</div>;
  }

  // Create a highlight creator for a specific chapter
  const createHighlightCreator =
    (chapterNumber: number) =>
    async (
      startVerse: number,
      endVerse: number,
      color: any,
      startChar?: number,
      endChar?: number,
      selectedText?: string,
    ) => {
      if (book && bookId) {
        await createHighlight(
          Number(bookId),
          chapterNumber,
          startVerse,
          endVerse,
          color,
          startChar,
          endChar,
          selectedText,
        );
      }
    };

  const handleHighlightDelete = async (highlightId: number) => {
    await deleteHighlight(highlightId);
  };

  const handleHighlightUpdate = async (highlightId: number, color: any) => {
    await updateHighlightColor(highlightId, color);
  };

  return (
    <section className={styles.content}>
      {book.chapters?.map((chapter) => (
        <div key={chapter.chapterNumber}>
          <MainText.Text
            text={chapter}
            bookName={book.name}
            testament={book.testament}
            bookId={Number(bookId)}
            chapterId={chapterIds[chapter.chapterNumber] || undefined}
            highlights={highlights}
            onHighlightCreate={createHighlightCreator(chapter.chapterNumber)}
            onHighlightDelete={handleHighlightDelete}
            onHighlightUpdate={handleHighlightUpdate}
          />
        </div>
      ))}
    </section>
  );
};
