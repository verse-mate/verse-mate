import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getTopicDetails, getTopicReferences } from "../../api/topics";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import * as Icon from "../../ui/Icons";
import contentStyles from "../../ui/LeftPanel/Content/content.module.css";
import { MainText } from "../../ui/MainText";
import {
  getNextTopic,
  getPreviousTopic,
  getTopicBySortOrder,
  getTopicCount,
} from "../../utils/topic-utils";
import { buildTopicUrl } from "../../utils/topicSlugs";

interface DesktopTopicViewProps {
  category: string;
  sortOrder: number;
  buttonsVisible?: boolean;
  scrollableCallbackRef?: (node: HTMLElement | null) => void;
}

export const DesktopTopicView: React.FC<DesktopTopicViewProps> = ({
  category,
  sortOrder,
  buttonsVisible = true,
  scrollableCallbackRef,
}) => {
  const { bibleVersion } = useGetSearchParams();
  const queryClient = useQueryClient();

  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicName, setTopicName] = useState<string>("");
  const [topicContent, setTopicContent] = useState<string>("");
  const [topicCount, setTopicCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isNearNext, setIsNearNext] = useState(false);
  const [isNearPrev, setIsNearPrev] = useState(false);

  const nextTopicButtonRef = useRef<HTMLButtonElement>(null);
  const prevTopicButtonRef = useRef<HTMLButtonElement>(null);

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
  const router = useRouter();

  const handleNextTopic = useCallback(async () => {
    const nextTopic = await getNextTopic(category, sortOrder, bibleVersion);
    if (nextTopic?.name) {
      const topicUrl = buildTopicUrl(category, nextTopic.name);
      const url =
        bibleVersion && bibleVersion !== "NASB1995"
          ? `${topicUrl}?v=${bibleVersion}`
          : topicUrl;
      router.push(url);
    }
  }, [category, sortOrder, bibleVersion, router]);

  const handlePreviousTopic = useCallback(async () => {
    const prevTopic = await getPreviousTopic(category, sortOrder, bibleVersion);
    if (prevTopic?.name) {
      const topicUrl = buildTopicUrl(category, prevTopic.name);
      const url =
        bibleVersion && bibleVersion !== "NASB1995"
          ? `${topicUrl}?v=${bibleVersion}`
          : topicUrl;
      router.push(url);
    }
  }, [category, sortOrder, bibleVersion, router]);

  // Proximity detection for buttons
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (window.innerWidth < 1024) return;

      const checkProximity = (
        buttonRef: React.RefObject<HTMLButtonElement>,
        setIsNear: React.Dispatch<React.SetStateAction<boolean>>,
      ) => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const distance = Math.sqrt(
            (e.clientX - centerX) ** 2 + (e.clientY - centerY) ** 2,
          );
          setIsNear(distance < 150);
        } else {
          setIsNear(false);
        }
      };

      checkProximity(nextTopicButtonRef, setIsNearNext);
      checkProximity(prevTopicButtonRef, setIsNearPrev);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const hasNextTopic = sortOrder < topicCount;
  const hasPreviousTopic = sortOrder > 1;

  if (isLoading) {
    return <div className={contentStyles.bookContent}>Loading topic...</div>;
  }

  if (error) {
    return (
      <div className={contentStyles.bookContent}>Error: {error.message}</div>
    );
  }

  return (
    <div className={contentStyles.bookContent} ref={scrollableCallbackRef}>
      <MainText.Root>
        <MainText.TopicText
          topicName={topicName}
          markdownContent={topicContent}
        />
        <div style={{ height: "30px" }} />
      </MainText.Root>

      {/* Previous topic button */}
      {hasPreviousTopic && (
        <button
          ref={prevTopicButtonRef}
          type="button"
          className={`${contentStyles.previousChapterBtn} ${!buttonsVisible && !isNearPrev ? contentStyles.hidden : ""}`}
          onClick={handlePreviousTopic}
        >
          <Icon.ChevronBackward className={contentStyles.chevronBackward} />
        </button>
      )}

      {/* Next topic button */}
      {hasNextTopic && (
        <button
          ref={nextTopicButtonRef}
          type="button"
          className={`${contentStyles.nextChapterBtn} ${!buttonsVisible && !isNearNext ? contentStyles.hidden : ""}`}
          onClick={handleNextTopic}
        >
          <Icon.ChevronForward className={contentStyles.chevronForward} />
        </button>
      )}
    </div>
  );
};
