import { useQuery } from "@tanstack/react-query";
import { getTopicCategories, getTopicsByCategory } from "../api/topics";

export const useTopicCategories = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["topic-categories"],
    queryFn: getTopicCategories,
  });

  return { categories: data, isLoading, error };
};

export const useTopicsByCategory = (category: string) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["topics", category],
    queryFn: () => getTopicsByCategory(category),
    enabled: !!category,
  });

  return { topics: data, isLoading, error };
};
