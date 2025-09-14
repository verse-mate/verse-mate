import type { HighlightColor } from "../HighlightColorPicker/types";

export interface HighlightMenuProps {
  highlightId: number;
  currentColor: HighlightColor;
  onColorChange: (color: HighlightColor) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  position: { x: number; y: number };
}

export const colors: { color: HighlightColor; hex: string }[] = [
  { color: "yellow", hex: "#FFEB3B" },
  { color: "green", hex: "#4CAF50" },
  { color: "blue", hex: "#2196F3" },
  { color: "pink", hex: "#E91E63" },
  { color: "purple", hex: "#9C27B0" },
  { color: "orange", hex: "#FF9800" },
];
