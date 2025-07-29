import { useEffect, useState } from "react";
import { useBookmarks } from "../../hooks/useBookmarks";
import * as Icon from "../Icons";
import styles from "./bookmarks.module.css";

type BookmarkButtonProps = {
  bookId: number;
  chapterNumber: number;
  bookName: string;
  testament: string;
  className?: string;
};

export const BookmarkButton = ({
  bookId,
  chapterNumber,
  bookName,
  testament,
  className,
}: BookmarkButtonProps) => {
  const { isBookmarked, addBookmark, removeBookmark } = useBookmarks();
  const [isLoading, setIsLoading] = useState(false);

  // Check if this chapter is bookmarked
  const bookmarked = isBookmarked(bookId, chapterNumber);

  const handleToggleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsLoading(true);

    try {
      if (bookmarked) {
        await removeBookmark(bookId, chapterNumber);
      } else {
        await addBookmark(bookId, chapterNumber, bookName, testament);
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={`${styles.bookmarkButton} ${bookmarked ? styles.bookmarked : ""} ${className || ""}`}
      onClick={handleToggleBookmark}
      disabled={isLoading}
      aria-label={bookmarked ? "Remove bookmark" : "Add bookmark"}
      title={bookmarked ? "Remove bookmark" : "Add bookmark"}
    >
      <Icon.BookmarkIcon className={bookmarked ? styles.bookmarkedIcon : ""} />
    </button>
  );
};
