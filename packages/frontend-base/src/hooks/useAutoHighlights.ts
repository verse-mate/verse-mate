import { useQuery } from "@tanstack/react-query";
import { api } from "backend-api";
import type { AutoHighlight } from "../ui/MainText/Content/Text/types";

interface UseAutoHighlightsParams {
  bookId?: number;
  chapterNumber?: number;
  userId?: string;
}

export const useAutoHighlights = ({
  bookId,
  chapterNumber,
  userId,
}: UseAutoHighlightsParams) => {
  // Fetch global default enabled setting for logged-out users
  const { data: defaultEnabledData } = useQuery({
    queryKey: ["auto-highlights-default-enabled"],
    queryFn: async () => {
      const response =
        await api.admin["auto-highlight-settings"]["default-enabled"].get();
      return response.data?.data?.default_enabled ?? false;
    },
    enabled: !userId, // Only fetch for logged-out users
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Fetch themes for logged-out users (to get default relevance thresholds)
  const { data: themes } = useQuery({
    queryKey: ["highlight-themes"],
    queryFn: async () => {
      const response = await api.bible["highlight-themes"].get();
      return response.data?.data || [];
    },
    enabled: !userId, // Only fetch for logged-out users
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Fetch user theme preferences
  const { data: preferences } = useQuery({
    queryKey: ["user-theme-preferences", userId],
    queryFn: async () => {
      if (!userId) return null;
      const response = await api.bible.user["theme-preferences"].get();
      return response.data?.data || response.data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Fetch auto-highlights for chapter
  const { data: autoHighlights, isLoading } = useQuery({
    queryKey: [
      "auto-highlights",
      bookId,
      chapterNumber,
      preferences,
      themes,
      defaultEnabledData,
    ],
    queryFn: async () => {
      if (!bookId || !chapterNumber) return [];

      // For logged-out users, check if auto-highlights are enabled globally
      if (!userId && !defaultEnabledData) {
        return [];
      }

      // Get enabled theme IDs and per-theme relevance thresholds
      let enabledThemes: number[] = [];
      const themeRelevanceMap: Record<number, number> = {};

      if (userId && preferences && Array.isArray(preferences)) {
        // Logged-in user: use their preferences
        const enabledPreferences = preferences.filter((p: any) => p.is_enabled);

        enabledThemes = enabledPreferences.map((p: any) => p.theme_id);

        // Build per-theme relevance map
        // Use custom relevance only if admin_override is true, otherwise use theme default
        enabledPreferences.forEach((p: any) => {
          themeRelevanceMap[p.theme_id] = p.admin_override
            ? p.relevance_threshold
            : p.default_relevance_threshold;
        });
      } else if (!userId && themes && Array.isArray(themes)) {
        // Logged-out user: use theme defaults
        const activeThemes = (themes as any[]).filter((t) => t.is_active);

        enabledThemes = activeThemes.map((t) => t.theme_id);

        // Build per-theme relevance map using default thresholds
        activeThemes.forEach((t: any) => {
          themeRelevanceMap[t.theme_id] = t.default_relevance_threshold || 3;
        });
      }

      // Build query params
      const queryParams: any = {};

      if (enabledThemes.length > 0) {
        queryParams.themes = enabledThemes.join(",");

        // Build theme_relevance parameter: "theme_id:relevance,theme_id:relevance"
        const themeRelevancePairs = Object.entries(themeRelevanceMap)
          .map(([themeId, relevance]) => `${themeId}:${relevance}`)
          .join(",");

        if (themeRelevancePairs) {
          queryParams.theme_relevance = themeRelevancePairs;
        }
      }

      // @ts-expect-error - Dynamic path parameter
      const response = await api.bible["auto-highlights"][bookId][
        chapterNumber
      ].get({
        query: queryParams,
      });

      // API returns {success: true, data: [...]} so we need response.data.data
      return (response.data?.data || []) as AutoHighlight[];
    },
    enabled: !!bookId && !!chapterNumber,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  return {
    autoHighlights: autoHighlights || [],
    isLoading,
  };
};
