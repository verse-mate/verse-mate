import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { getTopicDetails, getTopicReferences } from "../../api/topics";
import {
  useGetSearchParams,
  useSaveSearchParams,
} from "../../hooks/useSearchParams";
import * as Icon from "../../ui/Icons";
import { MainText } from "../../ui/MainText";
import { Renderer } from "../../ui/MarkdownRenderer/Content/content";
import {
  getNextTopic,
  getPreviousTopic,
  getTopicBySortOrder,
  getTopicCount,
} from "../../utils/topic-utils";
import styles from "./desktop-topic-view.module.css";
import mainContentStyles from "./main-content.module.css";

interface DesktopTopicViewProps {
  category: string;
  sortOrder: number;
}

export const DesktopTopicView: React.FC<DesktopTopicViewProps> = ({
  category,
  sortOrder,
}) => {
  const { bibleVersion } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();
  const queryClient = useQueryClient();

  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicName, setTopicName] = useState<string>("");
  const [topicContent, setTopicContent] = useState<string>("");
  const [topicCount, setTopicCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch current topic data
  useEffect(() => {
    const fetchCurrentTopic = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const topic = await getTopicBySortOrder(
          category,
          sortOrder,
          bibleVersion,
        );
        if (!topic) {
          setError(new Error("Topic not found"));
          return;
        }

        setTopicId(topic.topic_id);

        const [details, references] = await Promise.all([
          getTopicDetails(topic.topic_id, bibleVersion),
          getTopicReferences(topic.topic_id, bibleVersion || "NASB1995"),
        ]);

        setTopicName(details?.topic?.name || topic.name);
        setTopicContent(
          references?.references?.content || "No content available.",
        );
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentTopic();
  }, [category, sortOrder, bibleVersion]);

  // Fetch topic count
  useEffect(() => {
    const fetchCount = async () => {
      const count = await getTopicCount(category, bibleVersion);
      setTopicCount(count);
    };
    fetchCount();
  }, [category, bibleVersion]);

  // Prefetch adjacent topics
  useEffect(() => {
    const prefetchAdjacentTopics = async () => {
      // Prefetch next topic
      const nextTopic = await getNextTopic(category, sortOrder, bibleVersion);
      if (nextTopic) {
        queryClient.prefetchQuery({
          queryKey: ["topic-details", nextTopic.topic_id, bibleVersion],
          queryFn: () => getTopicDetails(nextTopic.topic_id, bibleVersion),
        });
        queryClient.prefetchQuery({
          queryKey: [
            "topic-references",
            nextTopic.topic_id,
            bibleVersion || "NASB1995",
          ],
          queryFn: () =>
            getTopicReferences(nextTopic.topic_id, bibleVersion || "NASB1995"),
        });
      }

      // Prefetch previous topic
      const prevTopic = await getPreviousTopic(
        category,
        sortOrder,
        bibleVersion,
      );
      if (prevTopic) {
        queryClient.prefetchQuery({
          queryKey: ["topic-details", prevTopic.topic_id, bibleVersion],
          queryFn: () => getTopicDetails(prevTopic.topic_id, bibleVersion),
        });
        queryClient.prefetchQuery({
          queryKey: [
            "topic-references",
            prevTopic.topic_id,
            bibleVersion || "NASB1995",
          ],
          queryFn: () =>
            getTopicReferences(prevTopic.topic_id, bibleVersion || "NASB1995"),
        });
      }
    };

    if (topicId) {
      prefetchAdjacentTopics();
    }
  }, [category, sortOrder, topicId, bibleVersion, queryClient]);

  // Navigation handlers
  const handleNextTopic = useCallback(async () => {
    const nextTopic = await getNextTopic(category, sortOrder, bibleVersion);
    if (nextTopic?.sort_order) {
      saveSearchParams({
        bookId: category,
        verseId: String(nextTopic.sort_order),
        testament: "TOPIC" as any,
      });
    }
  }, [category, sortOrder, bibleVersion, saveSearchParams]);

  const handlePreviousTopic = useCallback(async () => {
    const prevTopic = await getPreviousTopic(category, sortOrder, bibleVersion);
    if (prevTopic?.sort_order) {
      saveSearchParams({
        bookId: category,
        verseId: String(prevTopic.sort_order),
        testament: "TOPIC" as any,
      });
    }
  }, [category, sortOrder, bibleVersion, saveSearchParams]);

  const hasNextTopic = sortOrder < topicCount;
  const hasPreviousTopic = sortOrder > 1;

  if (isLoading) {
    return <div className={styles.container}>Loading topic...</div>;
  }

  if (error) {
    return <div className={styles.container}>Error: {error.message}</div>;
  }

  return (
    <div className={styles.container} style={{ position: "relative" }}>
      <MainText.Root>
        <Renderer markdownContent={`# ${topicName}`} variant="bible-text" />
        <Renderer markdownContent={topicContent} variant="bible-text" />
        <div style={{ height: "30px" }} />
      </MainText.Root>

      {/* Next topic button */}
      {hasNextTopic && (
        <button
          type="button"
          className={mainContentStyles.nextChapterBtn}
          onClick={handleNextTopic}
          style={{ zIndex: 10 }}
        >
          <Icon.ChevronForward className={mainContentStyles.chevronForward} />
        </button>
      )}

      {/* Previous topic button */}
      {hasPreviousTopic && (
        <button
          type="button"
          className={mainContentStyles.previousChapterBtn}
          onClick={handlePreviousTopic}
          style={{ zIndex: 10 }}
        >
          <Icon.ChevronBackward className={mainContentStyles.chevronBackward} />
        </button>
      )}
    </div>
  );
};
