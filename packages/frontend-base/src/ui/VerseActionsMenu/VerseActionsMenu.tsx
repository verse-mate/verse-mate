import { useEffect, useRef, useState } from "react";
import {
  MENU_PADDING,
  MENU_VERTICAL_OFFSET,
} from "../../constants/highlightColors";
import { getStrongsNumber } from "../../data/strongs-mapping";
import { useClickOutside } from "../../hooks/useClickOutside";
import { notify } from "../../notification";
import type { HighlightColor } from "../HighlightColorPicker/types";
import { BookIcon } from "../Icons/bookIcon";
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
  onDefine,
  selectedWord,
}: VerseActionsMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<HighlightColor>("yellow");

  // Check if selected word has a Strong's number
  const strongsNum = selectedWord ? getStrongsNumber(selectedWord) : null;
  const showDefineButton = !!strongsNum && !!onDefine;

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
        adjustedX = viewportWidth - rect.width - MENU_PADDING;
      }
      if (rect.left < 0) {
        adjustedX = MENU_PADDING;
      }

      // Adjust vertical position if menu goes off screen
      if (rect.bottom > viewportHeight) {
        adjustedY = position.y - rect.height - MENU_VERTICAL_OFFSET;
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
        notify({
          content: "Failed to create highlight",
          color: "var(--error)",
        });
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
        onClose();
      } catch (error) {
        console.error("Failed to bookmark:", error);
        notify({
          content: "Failed to update bookmark",
          color: "var(--error)",
        });
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
        notify({
          content: "Failed to open notes",
          color: "var(--error)",
        });
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
        notify({
          content: "Failed to copy verse",
          color: "var(--error)",
        });
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
        notify({
          content: "Failed to share verse",
          color: "var(--error)",
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDefine = () => {
    if (strongsNum && onDefine) {
      onDefine(strongsNum);
      // Don't close the menu - dictionary popover will show
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
          className={`${styles.actionButton} ${isBookmarked ? styles.bookmarked : ""} ${isLoading ? styles.disabled : ""}`}
          onClick={handleBookmark}
          disabled={isLoading}
          aria-label={isBookmarked ? "Remove bookmark" : "Add to Bookmarks"}
        >
          <BookmarkIcon
            className={`${styles.actionIcon} ${isBookmarked ? styles.bookmarkedIcon : ""}`}
            filled={isBookmarked}
          />
          <span className={styles.actionLabel}>
            {isBookmarked ? "Bookmarked" : "Add to Bookmarks"}
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

        {showDefineButton && (
          <button
            type="button"
            className={`${styles.actionButton} ${isLoading ? styles.disabled : ""}`}
            onClick={handleDefine}
            disabled={isLoading}
            aria-label="Define word"
          >
            <BookIcon className={styles.actionIcon} />
            <span className={styles.actionLabel}>Define Word</span>
          </button>
        )}
      </div>
    </div>
  );
};
