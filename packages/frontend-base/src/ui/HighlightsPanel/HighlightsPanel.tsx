import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { HighlightColor } from "../BibleText";
import styles from "./highlights-panel.module.css";

export interface Highlight {
  id: string;
  reference: string; // e.g., "Genesis 1:1"
  text: string;
  color: HighlightColor;
  book: string;
  chapter: number;
  verse: number;
  startOffset?: number;
  endOffset?: number;
}

interface HighlightsPanelProps {
  highlights: Highlight[];
  onNavigate?: (
    bookId: number,
    chapter: number,
    verse: number,
    highlightId: string,
  ) => void;
  onDelete?: (highlightId: string) => void;
  onColorChange?: (highlightId: string, newColor: HighlightColor) => void;
}

const HIGHLIGHT_COLORS: HighlightColor[] = [
  "blue",
  "green",
  "yellow",
  "pink",
  "purple",
  "orange",
];

/**
 * HighlightsPanel - Browse and manage user highlights
 * Phase 3.4 - Implemented
 * Features:
 * - List all user highlights
 * - Filter by color
 * - Navigate to highlighted verse
 * - Delete highlight
 * - Change highlight color (placeholder for now)
 */
export function HighlightsPanel({
  highlights,
  onNavigate,
  onDelete,
  onColorChange: _onColorChange,
}: HighlightsPanelProps) {
  const [selectedColor, setSelectedColor] = useState<HighlightColor>(null);

  // Filter highlights by color
  const filteredHighlights =
    selectedColor === null
      ? highlights
      : highlights.filter((h) => h.color === selectedColor);

  const handleHighlightClick = (highlight: Highlight) => {
    if (!onNavigate) return;
    // For now, we'll use a placeholder bookId (1 for Genesis)
    // In real implementation, this would come from the highlight data
    const bookId = 1; // Placeholder
    onNavigate(bookId, highlight.chapter, highlight.verse, highlight.id);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Highlights</h3>
      </div>

      {/* Color filters */}
      <div className={styles.colorFilters}>
        <button
          type="button"
          className={`${styles.colorFilter} ${selectedColor === null ? styles.active : ""}`}
          style={{ background: "var(--text-tertiary)" }}
          onClick={() => setSelectedColor(null)}
          title="All highlights"
        />
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`${styles.colorFilter} ${selectedColor === color ? styles.active : ""}`}
            style={{ background: `var(--highlight-${color})` }}
            onClick={() => setSelectedColor(color)}
            title={`${color} highlights`}
          />
        ))}
      </div>

      {/* Highlights list */}
      {filteredHighlights.length === 0 ? (
        <div className={styles.emptyState}>
          {selectedColor === null
            ? "No highlights yet. Select text to create highlights."
            : `No ${selectedColor} highlights.`}
        </div>
      ) : (
        <div className={styles.highlightList}>
          {filteredHighlights.map((highlight) => (
            <div
              key={highlight.id}
              className={`${styles.highlightItem} ${getHighlightItemClass(highlight.color)}`}
              onClick={() => handleHighlightClick(highlight)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleHighlightClick(highlight);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className={styles.reference}>{highlight.reference}</div>
              <div className={styles.text}>{highlight.text}</div>
              {onDelete && (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(highlight.id);
                    }}
                    title="Delete highlight"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getHighlightItemClass(color: HighlightColor): string {
  if (!color) return "";
  const colorMap: Record<string, string> = {
    blue: styles.highlightItemBlue,
    green: styles.highlightItemGreen,
    yellow: styles.highlightItemYellow,
    pink: styles.highlightItemPink,
    purple: styles.highlightItemPurple,
    orange: styles.highlightItemOrange,
  };
  return colorMap[color] || "";
}
