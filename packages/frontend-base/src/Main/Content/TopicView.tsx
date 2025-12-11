import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { getTopicDetails, getTopicReferences } from "../../api/topics";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import * as Icon from "../../ui/Icons";
import { MainText } from "../../ui/MainText";
import {
  getNextTopic,
  getPreviousTopic,
  getTopicBySortOrder,
  getTopicCount,
  mapCategoryToBackend,
} from "../../utils/topic-utils";
import { buildTopicUrl } from "../../utils/topicSlugs";
import mainContentStyles from "./main-content.module.css";

interface TopicViewProps {
  category: string;
  sortOrder: number;
  buttonsVisible?: boolean;
  scrollableCallbackRef?: (node: HTMLDivElement | null) => void;
}

interface VisibleTopic {
  category: string;
  sortOrder: number;
  topicId: string;
  name: string;
  content: string;
  key: string;
  className?: string;
}

export const TopicView: React.FC<TopicViewProps> = ({
  category,
  sortOrder,
  buttonsVisible = true,
  scrollableCallbackRef,
}) => {
  const { bibleVersion } = useGetSearchParams();
  const queryClient = useQueryClient();

  const [visibleTopics, setVisibleTopics] = useState<VisibleTopic[]>([]);
  const [topicCount, setTopicCount] = useState<number>(0);
  // Proximity state not yet implemented, always rely on buttonsVisible
  const isNearNext = false;
  const isNearPrev = false;

  const isAnimating = useRef(false);
  const nextTopicButtonRef = useRef<HTMLButtonElement>(null);
  const prevTopicButtonRef = useRef<HTMLButtonElement>(null);

  // Get current topic by category and sort_order using React Query for caching
  const { data: currentTopic } = useQuery({
    queryKey: ["topic-by-category-order", category, sortOrder, bibleVersion],
    queryFn: async () => {
      const topic = await getTopicBySortOrder(
        category,
        sortOrder,
        bibleVersion,
      );
      return topic;
    },
    staleTime: 5 * 60 * 1000, // Keep data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  // Use effective version to ensure queries run even when bibleVersion is undefined
  const effectiveVersion = bibleVersion || "NASB1995";

  // Fetch topic details with React Query for caching
  const { data: topicDetails } = useQuery({
    queryKey: ["topic-details", currentTopic?.topic_id, effectiveVersion],
    queryFn: () =>
      currentTopic?.topic_id
        ? getTopicDetails(currentTopic.topic_id, effectiveVersion)
        : Promise.resolve(null),
    enabled: !!currentTopic?.topic_id,
    placeholderData: undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Fetch topic references with React Query for caching
  const { data: topicReferences } = useQuery({
    queryKey: ["topic-references", currentTopic?.topic_id, effectiveVersion],
    queryFn: () =>
      currentTopic?.topic_id
        ? getTopicReferences(currentTopic.topic_id, effectiveVersion)
        : Promise.resolve(null),
    enabled: !!currentTopic?.topic_id,
    placeholderData: undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Update visible topics when data is loaded
  useEffect(() => {
    if (
      currentTopic &&
      topicDetails &&
      topicReferences &&
      !isAnimating.current
    ) {
      const content =
        topicReferences?.references?.content || "No content available.";
      const name = topicDetails?.topic?.name || currentTopic.name;

      setVisibleTopics([
        {
          category,
          sortOrder,
          topicId: currentTopic.topic_id,
          name,
          content,
          key: `${category}-${sortOrder}`,
        },
      ]);
    }
  }, [currentTopic, topicDetails, topicReferences, category, sortOrder]);

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
      const _backendCategory = mapCategoryToBackend(category);

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

    prefetchAdjacentTopics();
  }, [category, sortOrder, bibleVersion, queryClient]);

  const router = useRouter();

  // Navigation handlers
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

  // Animation end handler
  const handleAnimationEnd = useCallback(() => {
    isAnimating.current = false;
    setVisibleTopics((prev) => {
      if (!prev || prev.length === 0) return prev;
      if (prev.length >= 2) return [prev[prev.length - 1]];
      return prev;
    });
  }, []);

  // Swipe handlers
  const swipeHandlers = useSwipeable({
    onSwipedRight: async () => {
      if (isAnimating.current) return;
      if (typeof window !== "undefined" && window.innerWidth >= 1024) return; // Desktop: no swiping

      const prevTopic = await getPreviousTopic(
        category,
        sortOrder,
        bibleVersion,
      );
      if (!prevTopic || !prevTopic.sort_order) return;

      // Check if data is cached
      const prevTopicDetails = queryClient.getQueryData([
        "topic-details",
        prevTopic.topic_id,
        bibleVersion,
      ]);
      const prevTopicReferences = queryClient.getQueryData([
        "topic-references",
        prevTopic.topic_id,
        bibleVersion || "NASB1995",
      ]);

      if (!prevTopicDetails || !prevTopicReferences) {
        handlePreviousTopic();
        return;
      }

      isAnimating.current = true;
      const content =
        (prevTopicReferences as any)?.references?.content ||
        "No content available.";
      const name = (prevTopicDetails as any)?.topic?.name || prevTopic.name;

      setVisibleTopics((prev) => {
        const outgoingTopic = {
          ...prev[0],
          className: (mainContentStyles as any).slideOutRight,
        };
        const incomingTopic: VisibleTopic = {
          category,
          sortOrder: prevTopic.sort_order ?? 0,
          topicId: prevTopic.topic_id,
          name,
          content,
          key: `${category}-${prevTopic.sort_order}`,
          className: (mainContentStyles as any).slideInLeft,
        };
        return [outgoingTopic, incomingTopic];
      });

      setTimeout(() => handlePreviousTopic(), 50);
    },
    onSwipedLeft: async () => {
      if (isAnimating.current) return;
      if (typeof window !== "undefined" && window.innerWidth >= 1024) return; // Desktop: no swiping

      const nextTopic = await getNextTopic(category, sortOrder, bibleVersion);
      if (!nextTopic || !nextTopic.sort_order) return;

      // Check if data is cached
      const nextTopicDetails = queryClient.getQueryData([
        "topic-details",
        nextTopic.topic_id,
        bibleVersion,
      ]);
      const nextTopicReferences = queryClient.getQueryData([
        "topic-references",
        nextTopic.topic_id,
        bibleVersion || "NASB1995",
      ]);

      if (!nextTopicDetails || !nextTopicReferences) {
        handleNextTopic();
        return;
      }

      isAnimating.current = true;
      const content =
        (nextTopicReferences as any)?.references?.content ||
        "No content available.";
      const name = (nextTopicDetails as any)?.topic?.name || nextTopic.name;

      setVisibleTopics((prev) => {
        const outgoingTopic = {
          ...prev[0],
          className: (mainContentStyles as any).slideOutLeft,
        };
        const incomingTopic: VisibleTopic = {
          category,
          sortOrder: nextTopic.sort_order ?? 0,
          topicId: nextTopic.topic_id,
          name,
          content,
          key: `${category}-${nextTopic.sort_order}`,
          className: (mainContentStyles as any).slideInRight,
        };
        return [outgoingTopic, incomingTopic];
      });

      setTimeout(() => handleNextTopic(), 50);
    },
    delta: 30,
    swipeDuration: 500,
    preventScrollOnSwipe: false,
    trackTouch: true,
    trackMouse: false,
  });

  // Button click handlers
  const handleNextButtonClick = async () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      // Mobile/tablet: use animations
      if (isAnimating.current) return;

      const nextTopic = await getNextTopic(category, sortOrder, bibleVersion);
      if (!nextTopic || !nextTopic.sort_order) return;

      const nextTopicDetails = queryClient.getQueryData([
        "topic-details",
        nextTopic.topic_id,
        bibleVersion,
      ]);
      const nextTopicReferences = queryClient.getQueryData([
        "topic-references",
        nextTopic.topic_id,
        bibleVersion || "NASB1995",
      ]);

      if (!nextTopicDetails || !nextTopicReferences) {
        handleNextTopic();
        return;
      }

      isAnimating.current = true;
      const content =
        (nextTopicReferences as any)?.references?.content ||
        "No content available.";
      const name = (nextTopicDetails as any)?.topic?.name || nextTopic.name;

      setVisibleTopics((prev) => {
        const outgoingTopic = {
          ...prev[0],
          className: (mainContentStyles as any).slideOutLeft,
        };
        const incomingTopic: VisibleTopic = {
          category,
          sortOrder: nextTopic.sort_order ?? 0,
          topicId: nextTopic.topic_id,
          name,
          content,
          key: `${category}-${nextTopic.sort_order}`,
          className: (mainContentStyles as any).slideInRight,
        };
        return [outgoingTopic, incomingTopic];
      });

      setTimeout(() => handleNextTopic(), 50);
    } else {
      // Desktop: direct navigation
      handleNextTopic();
    }
  };

  const handlePreviousButtonClick = async () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      // Mobile/tablet: use animations
      if (isAnimating.current) return;

      const prevTopic = await getPreviousTopic(
        category,
        sortOrder,
        bibleVersion,
      );
      if (!prevTopic || !prevTopic.sort_order) return;

      const prevTopicDetails = queryClient.getQueryData([
        "topic-details",
        prevTopic.topic_id,
        bibleVersion,
      ]);
      const prevTopicReferences = queryClient.getQueryData([
        "topic-references",
        prevTopic.topic_id,
        bibleVersion || "NASB1995",
      ]);

      if (!prevTopicDetails || !prevTopicReferences) {
        handlePreviousTopic();
        return;
      }

      isAnimating.current = true;
      const content =
        (prevTopicReferences as any)?.references?.content ||
        "No content available.";
      const name = (prevTopicDetails as any)?.topic?.name || prevTopic.name;

      setVisibleTopics((prev) => {
        const outgoingTopic = {
          ...prev[0],
          className: (mainContentStyles as any).slideOutRight,
        };
        const incomingTopic: VisibleTopic = {
          category,
          sortOrder: prevTopic.sort_order ?? 0,
          topicId: prevTopic.topic_id,
          name,
          content,
          key: `${category}-${prevTopic.sort_order}`,
          className: (mainContentStyles as any).slideInLeft,
        };
        return [outgoingTopic, incomingTopic];
      });

      setTimeout(() => handlePreviousTopic(), 50);
    } else {
      // Desktop: direct navigation
      handlePreviousTopic();
    }
  };

  const hasNextTopic = sortOrder < topicCount;
  const hasPreviousTopic = sortOrder > 1;

  return (
    <div
      {...swipeHandlers}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {visibleTopics.map((topic, index) => {
        const isLastTopic = index === visibleTopics.length - 1;
        return (
          <div
            key={topic.key}
            className={`${mainContentStyles.bookContent} ${topic.className || ""}`}
            style={{
              position: visibleTopics.length > 1 ? "absolute" : "relative",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: index + 1,
            }}
            onAnimationEnd={index === 0 ? handleAnimationEnd : undefined}
            ref={isLastTopic ? scrollableCallbackRef : null}
          >
            <MainText.Root>
              <MainText.TopicText
                topicName={topic.name}
                markdownContent={topic.content}
              />
              <div style={{ height: "80px" }} />
            </MainText.Root>
          </div>
        );
      })}

      {/* Next topic button */}
      {hasNextTopic && (
        <button
          ref={nextTopicButtonRef}
          type="button"
          className={`${mainContentStyles.nextChapterBtn} ${
            !buttonsVisible && !isNearNext ? mainContentStyles.hidden : ""
          }`}
          onClick={handleNextButtonClick}
          style={{ zIndex: 10 }}
        >
          <Icon.ChevronForward className={mainContentStyles.chevronForward} />
        </button>
      )}

      {/* Previous topic button */}
      {hasPreviousTopic && (
        <button
          ref={prevTopicButtonRef}
          type="button"
          className={`${mainContentStyles.previousChapterBtn} ${
            !buttonsVisible && !isNearPrev ? mainContentStyles.hidden : ""
          }`}
          onClick={handlePreviousButtonClick}
          style={{ zIndex: 10 }}
        >
          <Icon.ChevronBackward className={mainContentStyles.chevronBackward} />
        </button>
      )}
    </div>
  );
};
