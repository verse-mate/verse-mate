import { useQuery } from "@tanstack/react-query";
import { getTopicDetails, getTopicReferences } from "../../api/topics";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { Renderer } from "../../ui/MarkdownRenderer/Content/content";
import styles from "./main-content.module.css";

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
    queryKey: ["topic-details", topicId],
    queryFn: () => getTopicDetails(topicId),
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

  if (isTopicLoading || isReferencesLoading) {
    return <div className={styles.bookContainer}>Loading topic...</div>;
  }

  if (topicError) {
    return (
      <div className={styles.bookContainer}>
        Error loading topic: {(topicError as Error).message}
      </div>
    );
  }

  if (referencesError) {
    return (
      <div className={styles.bookContainer}>
        Error loading references: {(referencesError as Error).message}
      </div>
    );
  }

  // Display topic content in the same way as Bible chapters
  return (
    <div className={styles.bookContent}>
      <h1>{topicDetails?.topic?.name}</h1>
      {topicReferences?.references?.content ? (
        <Renderer markdownContent={topicReferences.references.content} />
      ) : (
        <p>No content available.</p>
      )}
    </div>
  );
};
