import { useQuery } from "@tanstack/react-query";
import { getTopicDetails, getTopicReferences } from "../../api/topics";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { MainText } from "../../ui/MainText";
import { Renderer } from "../../ui/MarkdownRenderer/Content/content";
import mainContentStyles from "./main-content.module.css";

interface TopicViewProps {
  topicId: string;
}

export const TopicView: React.FC<TopicViewProps> = ({ topicId }) => {
  const { bibleVersion } = useGetSearchParams();

  const {
    data: topicDetails,
    isLoading: isTopicLoading,
    error: topicError,
  } = useQuery({
    queryKey: ["topic-details", topicId, bibleVersion],
    queryFn: () => getTopicDetails(topicId, bibleVersion),
    enabled: !!topicId,
  });

  // Get the processed references with Bible verses injected
  const {
    data: topicReferences,
    isLoading: isReferencesLoading,
    error: referencesError,
  } = useQuery({
    queryKey: ["topic-references", topicId, bibleVersion],
    queryFn: () => getTopicReferences(topicId, bibleVersion || "NASB1995"),
    enabled: !!topicId && !!bibleVersion,
  });

  if (isTopicLoading) {
    return (
      <div className={mainContentStyles.bookContainer}>
        Loading topic details...
      </div>
    );
  }

  if (isReferencesLoading) {
    return (
      <div className={mainContentStyles.bookContainer}>
        Loading topic references...
      </div>
    );
  }

  if (topicError) {
    return (
      <div className={mainContentStyles.bookContainer}>
        Error loading topic: {(topicError as Error).message}
      </div>
    );
  }

  if (referencesError) {
    return (
      <div className={mainContentStyles.bookContainer}>
        Error loading references: {(referencesError as Error).message}
      </div>
    );
  }

  // Display topic content in the same way as Bible chapters
  return (
    <div className={mainContentStyles.bookContent}>
      <MainText.Root>
        <Renderer
          markdownContent={`# ${topicDetails?.topic?.name}`}
          variant="bible-text"
        />
        {topicReferences?.references?.content ? (
          <Renderer
            markdownContent={topicReferences.references.content}
            variant="bible-text"
          />
        ) : (
          <p>No content available.</p>
        )}
        <div style={{ height: "20px" }} />
      </MainText.Root>
    </div>
  );
};
