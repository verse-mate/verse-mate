import { useQuery } from "@tanstack/react-query";
import { getTopicDetails, getTopicReferences } from "../../api/topics";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { MainText } from "../../ui/MainText";
import { Renderer } from "../../ui/MarkdownRenderer/Content/content";
import styles from "./desktop-topic-view.module.css";

interface DesktopTopicViewProps {
  topicId: string;
}

export const DesktopTopicView: React.FC<DesktopTopicViewProps> = ({
  topicId,
}) => {
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
    return <div className={styles.container}>Loading topic...</div>;
  }

  if (topicError || referencesError) {
    return (
      <div className={styles.container}>
        Error: {(topicError || referencesError)?.message}
      </div>
    );
  }

  return (
    <div className={styles.container}>
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
        <div style={{ height: "30px" }} />
      </MainText.Root>
    </div>
  );
};
