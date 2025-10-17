import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { getTopicDetails } from "../../api/topics";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { Explanation } from "../../ui/Explanation";

interface TopicExplanationContainerProps {
  topicId: string;
}

export const TopicExplanationContainer: React.FC<
  TopicExplanationContainerProps
> = ({ topicId }) => {
  const { explanationType, bibleVersion } = useGetSearchParams();

  // Use the main topic details endpoint which fetches all explanation types at once
  const {
    data: topicDetails,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["topic-details-explanation", topicId, bibleVersion],
    queryFn: () => getTopicDetails(topicId, bibleVersion),
    enabled: !!topicId,
  });

  // Extract the specific explanation type we need
  const explanation = topicDetails?.explanation?.[explanationType || "summary"];

  // Handle loading state
  if (isLoading) {
    // Create a mock explanation object with loading state for the Explanation components
    const loadingExplanation = {
      explanation: null,
      explanation_id: `topic-${topicId}`,
      language_code: bibleVersion || "en-US",
      isLoading: true,
    };

    return (
      <Explanation.MobileContainer
        chapters={undefined} // Topics don't have sequential chapters
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
        chapters={undefined} // Topics don't have sequential chapters
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
        chapters={undefined} // Topics don't have sequential chapters
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

  // For topics, we don't have chapters like Bible books, so we pass undefined for chapters
  return (
    <Explanation.MobileContainer
      chapters={undefined} // Topics don't have sequential chapters
      explanation={topicExplanation}
    />
  );
};
