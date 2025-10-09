import { useState } from "react";
import { useBookmarks } from "../../hooks/useBookmarks";
import { userSession } from "../../hooks/userSession";
import { addModal } from "../../modal/store";
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
  const { isBookmarked, addBookmark, removeBookmark, savePendingBookmark } =
    useBookmarks();
  const [isLoading, setIsLoading] = useState(false);
  const { session } = userSession();

  // Check if this chapter is bookmarked
  const bookmarked = isBookmarked(bookId, chapterNumber);

  const handleToggleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If user is not logged in, show login required modal and save bookmark intention
    if (!session) {
      // Save this chapter as a pending bookmark in localStorage
      savePendingBookmark(bookId, chapterNumber, bookName, testament);

      // Show login modal with option to open right panel login
      addModal({
        content: (
          <div className={styles.loginModal}>
            <h3>Sign in Required to Use Bookmarks</h3>
            <p>
              Bookmarking is only available for signed-in accounts. We've saved
              this chapter for you and will add it to your bookmarks as soon as
              you log in.
            </p>
            <div className={styles.loginModalButtons}>
              <button
                type="button"
                className={styles.loginButton}
                onClick={() => {
                  // Open right panel login by switching to the menu tab
                  try {
                    localStorage.setItem("postRightPanelContent", "login");
                  } catch {}
                  // Notify MainContent to switch tab and open login immediately
                  try {
                    window.dispatchEvent(
                      new CustomEvent("openRightPanelContent", {
                        detail: "login",
                      }),
                    );
                    window.dispatchEvent(
                      new CustomEvent("setActiveTab", { detail: "menu" }),
                    );
                  } catch {}
                  // Fallback for older flows
                  try {
                    const setActiveTab = (window as any).setActiveTab;
                    if (typeof setActiveTab === "function") {
                      setActiveTab("menu");
                    }
                  } catch {}
                  // Remove the modal after a short delay to allow the panel to open
                  setTimeout(() => {
                    const { removeAllModals } = require("../../modal/store");
                    removeAllModals();
                  }, 100);
                }}
              >
                Sign In
              </button>
            </div>
          </div>
        ),
      });
      return;
    }

    setIsLoading(true);

    try {
      if (bookmarked) {
        await removeBookmark(bookId, chapterNumber);
      } else {
        await addBookmark(bookId, chapterNumber, bookName, testament);
      }
    } catch {
      // Silently handle bookmark toggle errors
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
