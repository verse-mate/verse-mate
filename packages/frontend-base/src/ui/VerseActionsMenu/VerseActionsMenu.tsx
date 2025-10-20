import { useEffect, useRef, useState } from "react";
import { useClickOutside } from "../../hooks/useClickOutside";
import type { HighlightColor } from "../HighlightColorPicker/types";
import { BookmarkIcon } from "../Icons/bookmarkIcon";
import { CopyIcon } from "../Icons/copyIcon";
import { NotesIcon } from "../Icons/notesIcon";
import { ShareIcon } from "../Icons/shareIcon";
import styles from "./VerseActionsMenu.module.css";
import type { VerseActionsMenuProps } from "./types";
import { colors } from "./types";

export const VerseActionsMenu = ({
  position,
  selection,
  isBookmarked = false,
  onHighlight,
  onBookmark,
  onNote,
  onCopy,
  onShare,
  onClose,
}: VerseActionsMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<HighlightColor>("yellow");

  useClickOutside(menuRef, onClose);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = position.x;
      let adjustedY = position.y;

      // Adjust horizontal position if menu goes off screen
      if (rect.right > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      if (rect.left < 0) {
        adjustedX = 10;
      }

      // Adjust vertical position if menu goes off screen
      if (rect.bottom > viewportHeight) {
        adjustedY = position.y - rect.height - 20;
      }

      if (adjustedX !== position.x || adjustedY !== position.y) {
        menuRef.current.style.left = `${adjustedX}px`;
        menuRef.current.style.top = `${adjustedY}px`;
      }
    }
  }, [position]);

  const handleHighlight = async (color: HighlightColor) => {
    if (!isLoading) {
      setIsLoading(true);
      setSelectedColor(color);
      try {
        await onHighlight(color);
        onClose();
      } catch (error) {
        console.error("Failed to highlight:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleBookmark = async () => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        await onBookmark();
      } catch (error) {
        console.error("Failed to bookmark:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleNote = async () => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        await onNote();
        onClose();
      } catch (error) {
        console.error("Failed to open note:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCopy = async () => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        await onCopy();
        onClose();
      } catch (error) {
        console.error("Failed to copy:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleShare = async () => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        await onShare();
        onClose();
      } catch (error) {
        console.error("Failed to share:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const verseReference =
    selection.start === selection.end
      ? `Verse ${selection.start}`
      : `Verses ${selection.start}-${selection.end}`;

  return (
    <div
      ref={menuRef}
      className={styles.container}
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      role="menu"
      aria-label="Verse actions"
    >
      <div className={styles.header}>
        <span className={styles.title}>{verseReference}</span>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Highlight Color Section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Highlight Verse</div>
        <div className={styles.colorGrid}>
          {colors.map(({ color, hex, label }) => (
            <button
              key={color}
              type="button"
              className={`${styles.colorButton} ${
                selectedColor === color ? styles.selected : ""
              } ${isLoading ? styles.disabled : ""}`}
              style={{ backgroundColor: hex }}
              onClick={() => handleHighlight(color)}
              disabled={isLoading}
              aria-label={`Highlight with ${label}`}
              title={label}
            >
              {selectedColor === color && (
                <svg
                  className={styles.checkmark}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  aria-hidden="true"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.divider} />

      {/* Action Buttons Section */}
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.actionButton} ${isLoading ? styles.disabled : ""}`}
          onClick={handleBookmark}
          disabled={isLoading}
          aria-label={isBookmarked ? "Remove bookmark" : "Add to favorites"}
        >
          <BookmarkIcon className={styles.actionIcon} filled={isBookmarked} />
          <span className={styles.actionLabel}>
            {isBookmarked ? "Remove Bookmark" : "Add to Favorites"}
          </span>
        </button>

        <button
          type="button"
          className={`${styles.actionButton} ${isLoading ? styles.disabled : ""}`}
          onClick={handleNote}
          disabled={isLoading}
          aria-label="Take a note"
        >
          <NotesIcon className={styles.actionIcon} />
          <span className={styles.actionLabel}>Take a Note</span>
        </button>

        <button
          type="button"
          className={`${styles.actionButton} ${isLoading ? styles.disabled : ""}`}
          onClick={handleCopy}
          disabled={isLoading}
          aria-label="Copy verse"
        >
          <CopyIcon className={styles.actionIcon} />
          <span className={styles.actionLabel}>Copy Verse</span>
        </button>

        <button
          type="button"
          className={`${styles.actionButton} ${isLoading ? styles.disabled : ""}`}
          onClick={handleShare}
          disabled={isLoading}
          aria-label="Share verse"
        >
          <ShareIcon className={styles.actionIcon} />
          <span className={styles.actionLabel}>Share Verse</span>
        </button>
      </div>
    </div>
  );
};
