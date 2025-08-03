import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useEffect, useState } from "react";
import { getCachedBibleChapter } from "../../utils/offline-bible-cache";
import styles from "./verse-grid.module.css";

type VerseGridProps = {
  bookId: string;
  bookName: string;
  testament: TestamentEnum;
  verses: string[];
  onVerseSelect: (
    bookId: string,
    book: string,
    verse: string,
    testament: TestamentEnum,
  ) => void;
  selectedBook: string | null;
  selectedVerse: string | null;
};

export const useSelectedVerse = () => {
  const [selectedTestament, setSelectedTestament] = useState<"OT" | "NT" | "">(
    "",
  );
  const [selectedBookName, setSelectedBookName] = useState<string | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<string | null>(null);

  const handleVerseSelect = (
    testament: "OT" | "NT" | "",
    bookName: string,
    verse: string,
  ) => {
    setSelectedTestament(testament);
    setSelectedBookName(bookName);
    setSelectedVerse(verse);
  };

  return {
    selectedTestament,
    selectedBookName,
    selectedVerse,
    handleVerseSelect,
  };
};

export const VerseGrid = ({
  verses,
  selectedVerse,
  onVerseSelect,
  bookId,
  bookName,
  selectedBook,
  testament,
}: VerseGridProps) => {
  const [cachedChapters, setCachedChapters] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkCachedChapters = async () => {
      const cached = new Set<string>();

      for (const verse of verses) {
        try {
          const cachedChapter = await getCachedBibleChapter(
            Number(bookId),
            Number(verse),
          );
          if (cachedChapter) {
            cached.add(verse);
          }
        } catch (error) {
          // Chapter not cached, continue
        }
      }

      setCachedChapters(cached);
    };

    checkCachedChapters();
  }, [bookId, verses]);

  return (
    <div className={styles.versesContent}>
      <ul className={styles.versesGrid}>
        {verses.map((verse, index) => {
          const { handleVerseSelect } = useSelectedVerse();
          const isCached = cachedChapters.has(verse);
          const isSelected = selectedVerse === verse && selectedBook === bookId;

          return (
            <li
              key={index.toString()}
              className={`${styles.verseNumber} ${
                isSelected && styles.selected
              } ${isCached && styles.cached}`}
            >
              <button
                className={`${styles.verseNumber} ${
                  isSelected && styles.selected
                } ${isCached && styles.cached}`}
                onClick={() => {
                  onVerseSelect(
                    bookId,
                    bookName,
                    verse,
                    testament as TestamentEnum,
                  );
                  handleVerseSelect(testament || "", bookName, verse);
                }}
                type="button"
                aria-selected={isSelected}
                title={
                  isCached
                    ? `Chapter ${verse} (Available offline)`
                    : `Chapter ${verse}`
                }
              >
                {verse}
                {isCached && (
                  <span className={styles.offlineIndicator}>📱</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
