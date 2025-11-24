import type { HighlightColor } from "../ui/HighlightColorPicker/types";

/**
 * Centralized highlight color definitions
 * These colors are used across all highlighting UIs in the application
 * to ensure visual consistency
 */
export const HIGHLIGHT_COLORS: Array<{
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
  { color: "red", label: "Red", hex: "#FEE2E2" },
  { color: "teal", label: "Teal", hex: "#CCFBF1" },
  { color: "brown", label: "Brown", hex: "#E7D7C9" },
];

/**
 * Menu positioning constants
 */
export const MENU_PADDING = 10;
export const MENU_VERTICAL_OFFSET = 20;
