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
      return response.data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Fetch auto-highlights for chapter
  const { data: autoHighlights, isLoading } = useQuery({
    queryKey: ["auto-highlights", bookId, chapterNumber, preferences],
    queryFn: async () => {
      if (!bookId || !chapterNumber) return [];

      // Get enabled theme IDs and minimum relevance
      let enabledThemes: number[] = [];
      let minRelevance = 3;

      if (preferences && Array.isArray(preferences)) {
        enabledThemes = preferences
          .filter((p: any) => p.is_enabled)
          .map((p: any) => p.theme_id);

        const enabledRelevances = preferences
          .filter((p: any) => p.is_enabled)
          .map((p: any) => p.relevance_threshold);

        if (enabledRelevances.length > 0) {
          minRelevance = Math.min(...enabledRelevances);
        }
      }

      // Build query params
      const queryParams: any = {
        min_relevance: minRelevance.toString(),
      };

      if (enabledThemes.length > 0) {
        queryParams.themes = enabledThemes.join(",");
      }

      // @ts-expect-error - Dynamic path parameter
      const response = await api.bible["auto-highlights"][bookId][
        chapterNumber
      ].get({
        query: queryParams,
      });

      return (response.data || []) as AutoHighlight[];
    },
    enabled: !!bookId && !!chapterNumber,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  return {
    autoHighlights: autoHighlights || [],
    isLoading,
  };
};
