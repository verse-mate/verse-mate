import { useEffect, useRef, useState } from "react";
import { useClickOutside } from "../../hooks/useClickOutside";
import type { HighlightColor } from "../HighlightColorPicker";
import styles from "./HighlightMenu.module.css";
import type { HighlightMenuProps } from "./types";
import { colors } from "./types";

export const HighlightMenu = ({
  currentColor,
  onColorChange,
  onDelete,
  onClose,
  position,
}: HighlightMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  const handleColorSelect = async (color: HighlightColor) => {
    if (color !== currentColor && !isLoading) {
      setIsLoading(true);
      try {
        await onColorChange(color);
        onClose();
      } catch (error) {
        console.error("Failed to change color:", error);
        // Don't close the menu on error, let user retry
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        await onDelete();
        onClose();
      } catch (error) {
        console.error("Failed to delete highlight:", error);
        // Don't close the menu on error, let user retry
      } finally {
        setIsLoading(false);
      }
    }
  };

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
      aria-label="Highlight options"
    >
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Change Color</div>
        <div className={styles.colorGrid}>
          {colors.map(({ color, hex }) => (
            <button
              key={color}
              type="button"
              className={`${styles.colorButton} ${
                currentColor === color ? styles.selected : ""
              } ${isLoading ? styles.disabled : ""}`}
              style={{ backgroundColor: hex }}
              onClick={() => handleColorSelect(color)}
              disabled={isLoading}
              aria-label={`Change to ${color}`}
              title={color}
            >
              {currentColor === color && (
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

      <button
        type="button"
        className={`${styles.deleteButton} ${isLoading ? styles.disabled : ""}`}
        onClick={handleDelete}
        disabled={isLoading}
        aria-label="Delete highlight"
      >
        <svg
          className={styles.deleteIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" />
        </svg>
        {isLoading ? "Deleting..." : "Delete Highlight"}
      </button>
    </div>
  );
};
