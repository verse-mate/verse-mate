import { HIGHLIGHT_COLORS } from "../../constants/highlightColors";

export type HighlightColor =
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "purple"
  | "orange"
  | "red"
  | "teal"
  | "brown";

export interface HighlightColorPickerProps {
  onColorSelect: (color: HighlightColor) => void;
  onCancel: () => void;
  position?: { x: number; y: number };
}

export const colors = HIGHLIGHT_COLORS;
