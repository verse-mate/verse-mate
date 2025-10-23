import { api } from "backend-api";

export const getTopicCategories = async () => {
  const response = await api.topics.categories.get();
  return response.data?.categories;
};

export const getTopicsByCategory = async (
  category: string,
  bibleVersion?: string,
) => {
  const response = await api.topics.search.get({
    query: {
      category,
      bible_version: bibleVersion,
    },
  });
  return response.data?.topics;
};

export const getTopicDetails = async (
  topicId: string | undefined,
  bibleVersion?: string,
) => {
  if (!topicId) return null;
  const response = await api.topics({ id: topicId }).get({
    query: {
      bible_version: bibleVersion,
    },
  });
  return response.data;
};

export const getTopicReferences = async (
  topicId: string | undefined,
  version = "NASB1995",
) => {
  if (!topicId) return null;
  const response = await api.topics({ id: topicId }).references.get({
    query: { version },
  });
  return response.data;
};

export const getTopicExplanation = async (
  topicId: string,
  type: "summary" | "byline" | "detailed",
  lang = "en",
) => {
  const response = await api.topics({ id: topicId }).explanation.get({
    query: {
      type,
      lang,
    },
  });
  return response.data?.explanation;
};
