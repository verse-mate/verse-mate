/**
 * ChapterInfo - Displays chapter title, subtitle, and verse range
 * Phase 3 - Left Panel Refactor
 *
 * Matches Figma design with:
 * - Chapter title (e.g., "Genesis 1")
 * - Subtitle/pericope name (e.g., "The Creation")
 * - Verse range (e.g., "(Genesis 1:1 - 31)")
 */

import styles from "./chapter-info.module.css";

interface ChapterInfoProps {
  bookName: string;
  chapter: number;
  subtitle?: string;
  verseRange?: string;
}

export function ChapterInfo({
  bookName,
  chapter,
  subtitle,
  verseRange,
}: ChapterInfoProps) {
  return (
    <div className={styles.chapterInfo}>
      <h1 className={styles.chapterTitle}>
        {bookName} {chapter}
      </h1>

      {subtitle && <h2 className={styles.subtitle}>{subtitle}</h2>}

      {verseRange && <p className={styles.verseRange}>{verseRange}</p>}
    </div>
  );
}
