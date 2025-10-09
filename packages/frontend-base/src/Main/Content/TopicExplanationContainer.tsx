import type React from "react";
import { useEffect } from "react";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { fetchTopicExplanation } from "../../hooks/useTopics";
import { Explanation } from "../../ui/Explanation";

interface TopicExplanationContainerProps {
  topicId: string;
}

export const TopicExplanationContainer: React.FC<
  TopicExplanationContainerProps
> = ({ topicId }) => {
  const { explanationType, bibleVersion } = useGetSearchParams();

  // Fetch topic explanation using the same hook pattern as Bible explanations
  const { explanation, error, isLoading } = fetchTopicExplanation(
    topicId,
    explanationType,
    bibleVersion,
  );

  // Handle loading state
  if (isLoading) {
    // Create a mock explanation object with loading state for the Explanation components
    const loadingExplanation = {
      explanation: null,
      explanation_id: `topic-${topicId}`,
      language_code: bibleVersion || "en",
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
      language_code: bibleVersion || "en",
      error: error,
    };

    return (
      <Explanation.MobileContainer
        chapters={undefined} // Topics don't have sequential chapters
        explanation={errorExplanation}
      />
    );
  }

  // Handle empty content
  if (!explanation) {
    const emptyExplanation = {
      explanation: "No explanation available for this topic.",
      explanation_id: `topic-${topicId}`,
      language_code: bibleVersion || "en",
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
