/**
 * useViewMode Hook
 * Manages view mode state with URL persistence
 */

import { useCallback, useMemo } from "react";
import {
  useGetSearchParams,
  useSaveSearchParams,
} from "../../../hooks/useSearchParams";
import { DEFAULT_VIEW_MODE, type ViewMode } from "../types/view-mode";

export function useViewMode() {
  const { viewMode: urlViewMode } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  // Get current view mode from URL, fallback to default
  const viewMode: ViewMode = useMemo(() => {
    if (
      urlViewMode === "summary" ||
      urlViewMode === "by-line" ||
      urlViewMode === "detailed"
    ) {
      return urlViewMode;
    }
    return DEFAULT_VIEW_MODE;
  }, [urlViewMode]);

  // Set view mode (persists to URL)
  const setViewMode = useCallback(
    (newMode: ViewMode) => {
      saveSearchParams({ viewMode: newMode });
    },
    [saveSearchParams],
  );

  return {
    viewMode,
    setViewMode,
    isSummaryMode: viewMode === "summary",
    isByLineMode: viewMode === "by-line",
    isDetailedMode: viewMode === "detailed",
  };
}
