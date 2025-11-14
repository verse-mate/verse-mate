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
    queryKey: ["auto-highlights", bookId, chapterNumber, preferences],
    queryFn: async () => {
      if (!bookId || !chapterNumber) return [];

      // Get enabled theme IDs and per-theme relevance thresholds
      let enabledThemes: number[] = [];
      const themeRelevanceMap: Record<number, number> = {};

      if (preferences && Array.isArray(preferences)) {
        const enabledPreferences = preferences.filter((p: any) => p.is_enabled);

        enabledThemes = enabledPreferences.map((p: any) => p.theme_id);

        // Build per-theme relevance map
        enabledPreferences.forEach((p: any) => {
          themeRelevanceMap[p.theme_id] = p.relevance_threshold;
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
