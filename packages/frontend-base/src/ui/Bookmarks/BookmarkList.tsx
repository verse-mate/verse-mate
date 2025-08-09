import TestamentEnum from "database/src/models/public/TestamentEnum";
import { useState } from "react";
import { fetchAllTestaments } from "../../hooks/useBible";
import { type Bookmark, useBookmarks } from "../../hooks/useBookmarks";
import { useSaveSearchParams } from "../../hooks/useSearchParams";
import { updateSelectedBook } from "../../store/book-selection";
import * as Icon from "../Icons";
import styles from "./bookmarks.module.css";

export const BookmarkList = () => {
  const { bookmarks, isLoading, error, removeBookmark } = useBookmarks();
  const { saveSearchParams } = useSaveSearchParams();
  const [removingIds, setRemovingIds] = useState<Record<string, boolean>>({});

  // Get Bible book data to determine testament
  const { testaments } = fetchAllTestaments();

  const handleBookmarkClick = (bookmark: Bookmark) => {
    // Update the global selected book store
    if (bookmark.book_name) {
      updateSelectedBook(bookmark.book_name);
    }

    // Default to using the bookmark's testament if available
    let testament: TestamentEnum = bookmark.testament as TestamentEnum;

    // If testament is missing or invalid, look it up from book data
    if (!testament && testaments) {
      const bookData = testaments.find((book) => book.b === bookmark.book_id);
      if (bookData?.t) {
        testament = bookData.t as TestamentEnum;
      } else {
        // Fallback to OT if we can't determine the testament
        testament = TestamentEnum.OT;
      }
    }

    // Use chapter_number as verseId to navigate to the correct chapter
    saveSearchParams({
      bookId: String(bookmark.book_id),
      verseId: String(bookmark.chapter_number),
      testament,
    });
  };

  const handleRemoveBookmark = async (
    e: React.MouseEvent,
    bookmark: Bookmark,
  ) => {
    e.stopPropagation();

    const key = `${bookmark.book_id}-${bookmark.chapter_number}`;
    setRemovingIds((prev) => ({ ...prev, [key]: true }));

    try {
      await removeBookmark(bookmark.book_id, bookmark.chapter_number);
    } finally {
      setRemovingIds((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading bookmarks...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (bookmarks.length === 0) {
    return <div className={styles.empty}>No bookmarks yet</div>;
  }

  return (
    <div className={styles.bookmarkList}>
      {bookmarks.map((bookmark) => {
        const key = `${bookmark.book_id}-${bookmark.chapter_number}`;
        const isRemoving = removingIds[key] || false;

        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: <Will be addressed in a future accessibility pass>
          <div
            key={bookmark.id}
            className={styles.bookmarkItem}
            onClick={() => handleBookmarkClick(bookmark)}
          >
            <div className={styles.bookmarkInfo}>
              <div className={styles.bookmarkTitle}>
                {bookmark.book_name} {bookmark.chapter_number}
              </div>
            </div>
            <button
              type="button"
              className={styles.removeButton}
              onClick={(e) => handleRemoveBookmark(e, bookmark)}
              disabled={isRemoving}
              aria-label="Remove bookmark"
            >
              {isRemoving ? <span>...</span> : <Icon.CloseIcon />}
            </button>
          </div>
        );
      })}
    </div>
  );
};
