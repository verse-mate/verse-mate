import { useEffect, useRef } from "react";
import { AnalyticsEvent, analytics } from "../../analytics";
import { Button } from "../Button/Button";
import type { HighlightColor } from "../HighlightColorPicker/types";
import type { AutoHighlight } from "../MainText/Content/Text/types";
import styles from "./AutoHighlightTooltip.module.css";

interface AutoHighlightTooltipProps {
  highlight: AutoHighlight;
  position: { x: number; y: number };
  onClose: () => void;
  onSaveAsUserHighlight: (color: HighlightColor) => void;
  isLoggedIn: boolean;
  /** Optional book and chapter info for analytics tracking */
  bookId?: number;
  chapterNumber?: number;
}

export const AutoHighlightTooltip = ({
  highlight,
  position,
  onClose,
  onSaveAsUserHighlight,
  isLoggedIn,
  bookId,
  chapterNumber,
}: AutoHighlightTooltipProps) => {
  // Track tooltip view once when opened
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current && bookId && chapterNumber) {
      analytics.track(AnalyticsEvent.AUTO_HIGHLIGHT_TOOLTIP_VIEWED, {
        bookId,
        chapterNumber,
      });
      hasTracked.current = true;
    }
  }, [bookId, chapterNumber]);

  const handleSave = () => {
    // Map theme color to HighlightColor type
    const colorMap: Record<string, HighlightColor> = {
      yellow: "yellow",
      blue: "blue",
      green: "green",
      orange: "orange",
      pink: "pink",
      purple: "purple",
    };

    const color = colorMap[highlight.theme_color] || "yellow";
    onSaveAsUserHighlight(color);
    onClose();
  };

  return (
    <>
      {/* Backdrop to detect clicks outside */}
      <button
        type="button"
        className={styles.backdrop}
        onClick={onClose}
        aria-label="Close tooltip"
      />

      {/* Tooltip */}
      <div
        className={styles.tooltip}
        role="tooltip"
        aria-labelledby="auto-highlight-tooltip-title"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
      >
        <div className={styles.header}>
          <h4 id="auto-highlight-tooltip-title" className={styles.title}>
            {highlight.theme_name}
          </h4>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Relevance:</span>
            <span className={styles.value}>
              {highlight.relevance_score} / 5
            </span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Type:</span>
            <span className={styles.value}>AI-generated highlight</span>
          </div>
        </div>

        <div className={styles.actions}>
          {isLoggedIn ? (
            <Button
              variant="contained"
              onClick={handleSave}
              className={styles.saveButton}
            >
              Save as My Highlight
            </Button>
          ) : (
            <div className={styles.loginPrompt}>
              <p>Sign in to save this highlight to your collection</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
