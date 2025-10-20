import { HIGHLIGHT_COLORS } from "../../constants/highlightColors";
import type { HighlightColor } from "../HighlightColorPicker/types";

export interface VerseSelection {
  start: number;
  end: number;
  startChar?: number;
  endChar?: number;
  selectedText?: string;
}

export interface VerseActionsMenuProps {
  position: { x: number; y: number };
  selection: VerseSelection;
  isBookmarked?: boolean;
  onHighlight: (color: HighlightColor) => void;
  onBookmark: () => void;
  onNote: () => void;
  onCopy: () => void;
  onShare: () => void;
  onClose: () => void;
}

export const colors = HIGHLIGHT_COLORS;
