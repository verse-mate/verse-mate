import { api } from "backend-api";

export const getTopicCategories = async () => {
  const response = await api.topics.categories.get();
  return response.data?.categories;
};

export const getTopicsByCategory = async (category: string) => {
  const response = await api.topics.search.get({
    query: {
      category,
    },
  });
  return response.data?.topics;
};

export const getTopicDetails = async (topicId: string) => {
  const response = await api.topics({ id: topicId }).get();
  return response.data;
};
