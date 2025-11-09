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
  disableSelection?: boolean;
  commandHighlightMode?: boolean;
}

/**
 * BibleText - Enhanced verse rendering with highlights and word definitions
 * TODO: Implement in Phase 3.1
 * Features:
 * - Text selection for highlighting
 * - Partial text highlighting (character-level offsets)
 * - Word-level click for definitions
 * - Highlight color picker dialog
 * - Command highlighting (DISABLED - backend not ready)
 */
export function BibleText({
  text,
  verseNumber,
  verseReference,
  highlight,
  onHighlight,
  onBookmark,
  onNote,
  disableSelection = false,
  commandHighlightMode = false,
}: BibleTextProps) {
  // Placeholder implementation - will be replaced in Phase 3.1
  return (
    <span>
      {verseNumber && (
        <sup
          style={{
            color: "var(--text-tertiary)",
            fontSize: "0.75rem",
            marginRight: "0.375rem",
          }}
        >
          {verseNumber}
        </sup>
      )}
      {text}
    </span>
  );
}
