import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useState } from "react";
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
  return (
    <div className={styles.versesContent}>
      <ul className={styles.versesGrid}>
        {verses.map((verse, index) => {
          const { handleVerseSelect } = useSelectedVerse();
          return (
            <li
              key={index.toString()}
              className={`${styles.verseNumber} ${
                selectedVerse === verse &&
                selectedBook === bookId &&
                styles.selected
              }`}
            >
              <button
                className={`${styles.verseNumber} ${
                  selectedVerse === verse &&
                  selectedBook === bookId &&
                  styles.selected
                }`}
                data-tour-chapter={verse}
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
                aria-selected={
                  selectedVerse === verse && selectedBook === bookId
                }
              >
                {verse}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
