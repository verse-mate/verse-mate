import { api } from "backend-api";

interface Topic {
  topic_id: string;
  name: string;
  description: string;
  category: string;
  sort_order: number | undefined;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface TopicByCategory {
  topic_id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
}

export const getTopics = async (): Promise<Topic[]> => {
  try {
    const response = await (api.admin as any).topics.get();
    return response.data?.topics || [];
  } catch (error) {
    console.error("Error fetching topics:", error);
    throw error;
  }
};

export const getTopicsByCategory = async (
  category: string,
): Promise<TopicByCategory[]> => {
  try {
    const response = await api.topics.search.get({
      query: {
        category,
      },
    });
    return response.data?.topics || [];
  } catch (error) {
    console.error(`Error fetching topics for category ${category}:`, error);
    throw error;
  }
};

export const createTopic = async (
  topic: Omit<Topic, "topic_id">,
): Promise<Topic> => {
  try {
    const response = await (api.admin as any).topics.post(topic);
    return response.data?.topic;
  } catch (error) {
    console.error("Error creating topic:", error);
    throw error;
  }
};

export const updateTopic = async (topic: Topic): Promise<Topic> => {
  try {
    const response = await (api.admin as any).topics[topic.topic_id].put({
      name: topic.name,
      description: topic.description,
      category: topic.category,
      sort_order: topic.sort_order,
      is_active: topic.is_active,
    });
    return response.data?.topic;
  } catch (error) {
    console.error("Error updating topic:", error);
    throw error;
  }
};

export const deleteTopic = async (topicId: string): Promise<void> => {
  try {
    await (api.admin as any).topics[topicId].delete();
  } catch (error) {
    console.error("Error deleting topic:", error);
    throw error;
  }
};

// New function for chronological sorting
export const sortTopicsChronologically = async (params: {
  category: string;
}): Promise<any> => {
  try {
    const response = await (api.admin as any).topics[
      "sort-chronologically"
    ].post(params);
    return response.data;
  } catch (error) {
    console.error("Error sorting topics chronologically:", error);
    throw error;
  }
};
