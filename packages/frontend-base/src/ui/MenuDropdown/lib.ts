import type { CSSProperties } from "react";

const errorColor = {
  "--color": "var(--error)",
  "--bg-color": "var(--error)",
} as CSSProperties;

const brandColor = {
  "--color": "var(--foreground)",
  "--bg-color": "var(--dust)",
} as CSSProperties;

export const colorsMap = {
  error: errorColor,
  brand: brandColor,
};

export type Color = keyof typeof colorsMap;
