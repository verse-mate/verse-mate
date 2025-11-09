import { useState } from "react";
import styles from "./bible-text.module.css";

export type HighlightColor =
  | "blue"
  | "green"
  | "yellow"
  | "pink"
  | "purple"
  | "orange"
  | null;

interface HighlightData {
  color: HighlightColor;
  startOffset?: number;
  endOffset?: number;
  isGlowing?: boolean;
}

interface BibleTextProps {
  text: string;
  verseNumber?: number;
  verseReference: string; // e.g., "Genesis 1:1"
  highlight?: HighlightData[];
  onHighlight?: (
    color: HighlightColor,
    startOffset: number,
    endOffset: number,
  ) => void;
  onBookmark?: () => void;
  onNote?: () => void;
  onWordClick?: (word: string, position: { x: number; y: number }) => void;
  disableSelection?: boolean;
  commandHighlightMode?: boolean;
}

interface TextSegment {
  text: string;
  color: HighlightColor;
  isGlowing?: boolean;
  startOffset: number;
  endOffset: number;
}

/**
 * BibleText - Enhanced verse rendering with highlights and word definitions
 * Phase 3.1 - Implemented
 * Features:
 * - Text selection for highlighting
 * - Partial text highlighting (character-level offsets)
 * - Word-level click for definitions
 * - Highlight glow animation for navigation
 */
export function BibleText({
  text,
  verseNumber,
  verseReference: _verseReference,
  highlight = [],
  onHighlight,
  onBookmark: _onBookmark,
  onNote: _onNote,
  onWordClick,
  disableSelection = false,
  commandHighlightMode: _commandHighlightMode = false,
}: BibleTextProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // Build text segments with highlights
  const segments = buildTextSegments(text, highlight);

  const handleTextSelection = () => {
    if (disableSelection) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setShowColorPicker(false);
      return;
    }

    const selectedText = selection.toString();
    if (selectedText.length === 0) return;

    // Calculate character offsets
    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    const parentElement = range.startContainer.parentElement;
    if (!parentElement) return;
    preSelectionRange.selectNodeContents(parentElement);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;
    const end = start + selectedText.length;

    setSelectionRange({ start, end });
    setShowColorPicker(true);
  };

  const handleColorSelect = (color: HighlightColor) => {
    if (selectionRange && onHighlight) {
      onHighlight(color, selectionRange.start, selectionRange.end);
    }
    setShowColorPicker(false);
    window.getSelection()?.removeAllRanges();
  };

  const handleWordClick = (
    word: string,
    event: React.MouseEvent<HTMLSpanElement>,
  ) => {
    if (!onWordClick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onWordClick(word, { x: rect.left, y: rect.bottom });
  };

  return (
    <span className={styles.verse}>
      {verseNumber && <sup className={styles.verseNumber}>{verseNumber}</sup>}
      {segments.map((segment, index) => (
        <span
          key={`${segment.startOffset}-${segment.endOffset}-${index}`}
          className={getSegmentClassName(segment)}
          onMouseUp={handleTextSelection}
          onClick={(e) => {
            const word = segment.text.trim();
            if (word) handleWordClick(word, e);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              const word = segment.text.trim();
              if (word)
                handleWordClick(
                  word,
                  e as unknown as React.MouseEvent<HTMLSpanElement>,
                );
            }
          }}
          role="button"
          tabIndex={0}
        >
          {segment.text}
        </span>
      ))}
      {showColorPicker && (
        <div className={styles.colorPicker}>
          <button
            type="button"
            className={`${styles.colorButton} ${styles.colorBlue}`}
            onClick={() => handleColorSelect("blue")}
            title="Blue"
          />
          <button
            type="button"
            className={`${styles.colorButton} ${styles.colorGreen}`}
            onClick={() => handleColorSelect("green")}
            title="Green"
          />
          <button
            type="button"
            className={`${styles.colorButton} ${styles.colorYellow}`}
            onClick={() => handleColorSelect("yellow")}
            title="Yellow"
          />
          <button
            type="button"
            className={`${styles.colorButton} ${styles.colorPink}`}
            onClick={() => handleColorSelect("pink")}
            title="Pink"
          />
          <button
            type="button"
            className={`${styles.colorButton} ${styles.colorPurple}`}
            onClick={() => handleColorSelect("purple")}
            title="Purple"
          />
          <button
            type="button"
            className={`${styles.colorButton} ${styles.colorOrange}`}
            onClick={() => handleColorSelect("orange")}
            title="Orange"
          />
        </div>
      )}
    </span>
  );
}

/**
 * Build text segments from highlights
 * Handles overlapping highlights by prioritizing the first one
 */
function buildTextSegments(
  text: string,
  highlights: HighlightData[],
): TextSegment[] {
  if (highlights.length === 0) {
    return [
      {
        text,
        color: null,
        startOffset: 0,
        endOffset: text.length,
        isGlowing: false,
      },
    ];
  }

  const segments: TextSegment[] = [];
  let currentPos = 0;

  // Sort highlights by start position
  const sortedHighlights = [...highlights].sort((a, b) => {
    const aStart = a.startOffset ?? 0;
    const bStart = b.startOffset ?? 0;
    return aStart - bStart;
  });

  for (const highlight of sortedHighlights) {
    const start = highlight.startOffset ?? 0;
    const end = highlight.endOffset ?? text.length;

    // Add unhighlighted text before this highlight
    if (currentPos < start) {
      segments.push({
        text: text.slice(currentPos, start),
        color: null,
        startOffset: currentPos,
        endOffset: start,
        isGlowing: false,
      });
    }

    // Add highlighted text
    segments.push({
      text: text.slice(start, end),
      color: highlight.color,
      startOffset: start,
      endOffset: end,
      isGlowing: highlight.isGlowing,
    });

    currentPos = Math.max(currentPos, end);
  }

  // Add remaining unhighlighted text
  if (currentPos < text.length) {
    segments.push({
      text: text.slice(currentPos),
      color: null,
      startOffset: currentPos,
      endOffset: text.length,
      isGlowing: false,
    });
  }

  return segments;
}

/**
 * Get CSS class name for a text segment
 */
function getSegmentClassName(segment: TextSegment): string {
  const classes = [styles.segment];

  if (segment.color) {
    classes.push(styles[`highlight${capitalize(segment.color)}`]);
  }

  if (segment.isGlowing && segment.color) {
    classes.push(styles[`glow${capitalize(segment.color)}`]);
  }

  return classes.join(" ");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
