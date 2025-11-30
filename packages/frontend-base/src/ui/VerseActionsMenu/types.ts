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
  onHighlight: (color: HighlightColor) => Promise<void> | void;
  onBookmark: () => Promise<void> | void;
  onNote: () => Promise<void> | void;
  onCopy: () => Promise<void> | void;
  onShare: () => Promise<void> | void;
  onClose: () => void;
  onDefine?: (strongsNum: string) => void;
  selectedWord?: string;
}

export const colors = HIGHLIGHT_COLORS;
