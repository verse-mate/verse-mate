import { useQuery } from "@tanstack/react-query";
import {
  getTopicCategories,
  getTopicExplanation,
  getTopicsByCategory,
} from "../api/topics";

export const useTopicCategories = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["topic-categories"],
    queryFn: getTopicCategories,
  });

  return { categories: data, isLoading, error };
};

export const useTopicsByCategory = (
  category: string,
  bibleVersion?: string,
) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["topics", category, bibleVersion],
    queryFn: () => getTopicsByCategory(category, bibleVersion),
    enabled: !!category,
  });

  return { topics: data, isLoading, error };
};

// Add a new hook for fetching topic explanations that follows the same pattern as fetchExplanation
export const fetchTopicExplanation = (
  topicId: string,
  explanationType?: string,
  bibleVersion?: string,
) => {
  const {
    data: explanation,
    error,
    isFetching,
    isLoading,
  } = useQuery({
    queryKey: ["topic-explanation", topicId, explanationType, bibleVersion],
    queryFn: () =>
      getTopicExplanation(
        topicId,
        (explanationType as "summary" | "byline" | "detailed" | undefined) ||
          "summary",
        bibleVersion || "en",
      ),
    retry: 2,
    retryDelay: 3000,
  });

  return {
    explanation,
    error: error as Error | null,
    isLoading: isLoading || isFetching,
  };
};
