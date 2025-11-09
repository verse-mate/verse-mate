import type { HighlightColor } from "../BibleText";

interface Highlight {
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

/**
 * HighlightsPanel - Browse and manage user highlights
 * TODO: Implement in Phase 3.4
 * Features:
 * - List all user highlights
 * - Filter by color
 * - Navigate to highlighted verse
 * - Delete highlight
 * - Change highlight color
 */
export function HighlightsPanel({
  highlights,
  onNavigate,
  onDelete,
  onColorChange,
}: HighlightsPanelProps) {
  // Placeholder implementation - will be replaced in Phase 3.4
  return (
    <div style={{ padding: "1rem" }}>
      <h3 style={{ marginBottom: "0.5rem" }}>Highlights Panel</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
        {highlights.length} highlights (Placeholder)
      </p>
    </div>
  );
}
