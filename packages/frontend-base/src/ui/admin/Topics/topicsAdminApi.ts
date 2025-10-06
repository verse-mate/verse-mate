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

// TODO: Fix API structure - currently using mock data for demonstration
export const getTopics = async (): Promise<Topic[]> => {
  // Mock implementation for now
  return [
    {
      topic_id: "1",
      name: "The Fall of Man",
      description:
        "The story of Adam and Eve's disobedience in the Garden of Eden",
      category: "EVENT",
      sort_order: 1,
      is_active: true,
    },
    {
      topic_id: "2",
      name: "The Birth of Jesus Christ",
      description: "The miraculous birth of Jesus in Bethlehem",
      category: "EVENT",
      sort_order: 2,
      is_active: true,
    },
  ];
};

export const createTopic = async (
  topic: Omit<Topic, "topic_id">,
): Promise<Topic> => {
  // Mock implementation for now
  return {
    ...topic,
    topic_id: "mock-id",
  };
};

export const updateTopic = async (topic: Topic): Promise<Topic> => {
  // Mock implementation for now
  return topic;
};

export const deleteTopic = async (topicId: string): Promise<void> => {
  // Mock implementation for now
  return Promise.resolve();
};
