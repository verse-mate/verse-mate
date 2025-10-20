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

export const colors: Array<{
  color: HighlightColor;
  label: string;
  hex: string;
}> = [
  { color: "yellow", label: "Yellow", hex: "#FEF3C7" },
  { color: "green", label: "Green", hex: "#D1FAE5" },
  { color: "blue", label: "Blue", hex: "#DBEAFE" },
  { color: "pink", label: "Pink", hex: "#FCE7F3" },
  { color: "purple", label: "Purple", hex: "#EDE9FE" },
  { color: "orange", label: "Orange", hex: "#FED7AA" },
];
