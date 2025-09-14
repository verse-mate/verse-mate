import { useRef, useState } from "react";
import { useClickOutside } from "../../hooks/useClickOutside";
import styles from "./HighlightColorPicker.module.css";
import type { HighlightColor, HighlightColorPickerProps } from "./types";
import { colors } from "./types";

export const HighlightColorPicker = ({
  onColorSelect,
  onCancel,
  position = { x: 0, y: 0 },
}: HighlightColorPickerProps) => {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [selectedColor, setSelectedColor] = useState<HighlightColor>("yellow");

  useClickOutside(pickerRef, onCancel);

  const handleColorSelect = (color: HighlightColor) => {
    setSelectedColor(color);
    onColorSelect(color);
  };

  return (
    <div
      ref={pickerRef}
      className={styles.container}
      style={{
        position: "absolute",
        top: `${position.y}px`,
        left: `${position.x}px`,
      }}
    >
      <div className={styles.header}>
        <span className={styles.title}>Highlight Color</span>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onCancel}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className={styles.colorGrid}>
        {colors.map(({ color, label, hex }) => (
          <button
            key={color}
            type="button"
            className={`${styles.colorButton} ${
              selectedColor === color ? styles.selected : ""
            }`}
            style={{ backgroundColor: hex }}
            onClick={() => handleColorSelect(color)}
            aria-label={label}
            title={label}
          >
            {selectedColor === color && (
              <svg
                className={styles.checkmark}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-label="Selected"
                role="img"
              >
                <title>Selected</title>
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
