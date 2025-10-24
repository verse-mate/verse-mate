import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { getTopicDetails } from "../../api/topics";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { Explanation } from "../../ui/Explanation";

import { useEffect, useState } from "react";
import { getTopicBySortOrder, getTopicCount } from "../../utils/topic-utils";

interface TopicExplanationContainerProps {
  category: string;
  sortOrder: number;
}

export const TopicExplanationContainer: React.FC<
  TopicExplanationContainerProps
> = ({ category, sortOrder }) => {
  const { explanationType, bibleVersion } = useGetSearchParams();
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicCount, setTopicCount] = useState<number | undefined>(undefined);

  // Fetch current topic's topicId from category and sortOrder
  useEffect(() => {
    const fetchTopic = async () => {
      const topic = await getTopicBySortOrder(
        category,
        sortOrder,
        bibleVersion,
      );
      if (topic) {
        setTopicId(topic.topic_id);
      }
    };
    fetchTopic();
  }, [category, sortOrder, bibleVersion]);

  // Fetch topic count for navigation
  useEffect(() => {
    const fetchCount = async () => {
      const count = await getTopicCount(category, bibleVersion);
      setTopicCount(count);
    };
    fetchCount();
  }, [category, bibleVersion]);

  // Use the main topic details endpoint which fetches all explanation types at once
  const {
    data: topicDetails,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["topic-details-explanation", topicId, bibleVersion],
    queryFn: () => {
      if (!topicId) return Promise.resolve(null);
      return getTopicDetails(topicId, bibleVersion);
    },
    enabled: !!topicId,
  });

  // Extract the specific explanation type we need
  const explanation = topicDetails?.explanation?.[explanationType || "summary"];

  // Handle loading state
  if (isLoading || !topicId) {
    // Create a mock explanation object with loading state for the Explanation components
    const loadingExplanation = {
      explanation: null,
      explanation_id: `topic-${topicId || `${category}-${sortOrder}`}`,
      language_code: bibleVersion || "en-US",
      isLoading: true,
    };

    return (
      <Explanation.MobileContainer
        chapters={topicCount} // Pass topic count for navigation
        explanation={loadingExplanation}
      />
    );
  }

  // Handle error state
  if (error) {
    // Create a mock explanation object with error state for the Explanation components
    const errorExplanation = {
      explanation: null,
      explanation_id: `topic-${topicId}`,
      language_code: bibleVersion || "en-US",
      error: error,
    };

    return (
      <Explanation.MobileContainer
        chapters={topicCount} // Pass topic count for navigation
        explanation={errorExplanation}
      />
    );
  }

  const hasRealExplanation = explanation && explanation.trim().length > 0;

  if (!hasRealExplanation) {
    const emptyExplanation = {
      explanation:
        "**Topic Explanation Coming Soon**\n\nExplanations for this topic are currently being generated. In the meantime, you can:\n\n- Read the Bible references in the main topic content\n- Explore the verses and passages mentioned\n- Use the chat feature to ask questions about this topic\n\nCheck back later for detailed explanations!",
      explanation_id: `topic-${topicId}`,
      language_code: bibleVersion || "en-US",
    };

    return (
      <Explanation.MobileContainer
        chapters={topicCount} // Pass topic count for navigation
        explanation={emptyExplanation}
      />
    );
  }

  // Create an explanation object that follows the same structure as Bible explanations
  // The Explanation.Content component expects explanation.explanation to be the actual content
  const topicExplanation = {
    explanation: explanation, // This is the actual explanation content
    explanation_id: `topic-${topicId}`,
    language_code: bibleVersion || "en",
  };

  // Pass topic count to enable navigation between topics via swiping
  return (
    <Explanation.MobileContainer
      chapters={topicCount} // Pass topic count for navigation
      explanation={topicExplanation}
    />
  );
};
