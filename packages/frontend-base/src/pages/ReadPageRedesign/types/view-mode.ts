/**
 * View Mode Types
 * Defines the three view modes for the read page redesign
 */

export type ViewMode = "summary" | "by-line" | "detailed";

export const VIEW_MODES: Record<ViewMode, string> = {
  summary: "Summary",
  "by-line": "By Line",
  detailed: "Detailed",
} as const;

export const DEFAULT_VIEW_MODE: ViewMode = "summary";
