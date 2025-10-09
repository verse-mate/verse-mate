import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getTopicDetails } from "../../api/topics";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { useVerseParser } from "../../hooks/useVerseParser";
import { Renderer } from "../../ui/MarkdownRenderer/Content/content";
import styles from "./main-content.module.css";

interface TopicViewProps {
  topicId: string;
}

export const TopicView: React.FC<TopicViewProps> = ({ topicId }) => {
  const { bibleVersion } = useGetSearchParams();
  const {
    mutate: parseVerses,
    data: parsedContent,
    isPending: isParsing,
    error: parseError,
    isSuccess,
  } = useVerseParser();
  const [contentToParse, setContentToParse] = useState<string | null>(null);

  const {
    data: topicDetails,
    isLoading: isTopicLoading,
    error: topicError,
  } = useQuery({
    queryKey: ["topic-details", topicId],
    queryFn: () => getTopicDetails(topicId),
    enabled: !!topicId,
  });

  // Handle topic details changes
  useEffect(() => {
    if (topicDetails?.references?.content) {
      setContentToParse(topicDetails.references.content);
    } else {
      setContentToParse(null);
    }
  }, [topicDetails]);

  // Handle parsing when content or bible version changes
  useEffect(() => {
    if (contentToParse && bibleVersion) {
      parseVerses({ content: contentToParse, bibleVersion });
    }
  }, [contentToParse, bibleVersion, parseVerses]);

  if (isTopicLoading) {
    return <div className={styles.bookContainer}>Loading topic...</div>;
  }

  if (topicError) {
    return (
      <div className={styles.bookContainer}>
        Error loading topic: {(topicError as Error).message}
      </div>
    );
  }

  // Display topic content in the same way as Bible chapters
  return (
    <section className={styles.content}>
      <div>
        <h1>{topicDetails?.topic?.name}</h1>
        {isParsing ? (
          <p>Parsing references...</p>
        ) : parseError ? (
          <p>Error parsing references: {(parseError as Error).message}</p>
        ) : parsedContent ? (
          <Renderer markdownContent={parsedContent} />
        ) : contentToParse === null ? (
          <p>No content available.</p>
        ) : (
          <p>Waiting for content to parse...</p>
        )}
      </div>
    </section>
  );
};
