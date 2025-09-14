export type HighlightColor =
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "purple"
  | "orange";

export interface HighlightColorPickerProps {
  onColorSelect: (color: HighlightColor) => void;
  onCancel: () => void;
  position?: { x: number; y: number };
}

export const colors: { color: HighlightColor; label: string; hex: string }[] = [
  { color: "yellow", label: "Yellow", hex: "#FFEB3B" },
  { color: "green", label: "Green", hex: "#4CAF50" },
  { color: "blue", label: "Blue", hex: "#2196F3" },
  { color: "pink", label: "Pink", hex: "#E91E63" },
  { color: "purple", label: "Purple", hex: "#9C27B0" },
  { color: "orange", label: "Orange", hex: "#FF9800" },
];
