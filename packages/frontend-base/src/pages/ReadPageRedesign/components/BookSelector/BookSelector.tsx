/**
 * BookSelector - Simple book/chapter display for header
 * Phase 2 - Header Refactor
 *
 * Shows current book and chapter in format: "📖 Genesis 1"
 * Click behavior can be added later for opening book/chapter selection modal
 */

import { BookOpen } from "lucide-react";
import styles from "./book-selector.module.css";

interface BookSelectorProps {
  bookName: string;
  chapter: number;
  onClick?: () => void;
}

export function BookSelector({
  bookName,
  chapter,
  onClick,
}: BookSelectorProps) {
  return (
    <button
      type="button"
      className={styles.bookSelector}
      onClick={onClick}
      title="Select book and chapter"
    >
      <BookOpen size={16} className={styles.icon} />
      <span className={styles.text}>
        {bookName} {chapter}
      </span>
    </button>
  );
}
