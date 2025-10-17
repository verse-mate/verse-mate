import { useQuery } from "@tanstack/react-query";
import { getTopicsByCategory } from "../../api/topics";
import {
  useGetSearchParams,
  useSaveSearchParams,
} from "../../hooks/useSearchParams";
import { useTopicsByCategory } from "../../hooks/useTopics";
import { Accordion } from "../../ui/Accordion";

interface TopicContentProps {
  category: string;
  filter: string;
  onTopicClick?: () => void;
}

export const TopicContent: React.FC<TopicContentProps> = ({
  category,
  filter,
  onTopicClick,
}) => {
  // Map frontend category names to backend category names
  const backendCategory =
    category === "EVENTS"
      ? "EVENT"
      : category === "PROPHECIES"
        ? "PROPHECY"
        : category === "PARABLES"
          ? "PARABLE"
          : category;

  const { bibleVersion } = useGetSearchParams();

  // When there's a filter, fetch all topics from all categories
  const hasFilter = filter.trim().length > 0;

  // Fetch topics for the current category
  const {
    topics: currentCategoryTopics,
    isLoading: isLoadingCurrent,
    error: errorCurrent,
  } = useTopicsByCategory(backendCategory, bibleVersion);

  // Fetch all other categories when filtering
  const { data: eventsTopics, isLoading: isLoadingEvents } = useQuery({
    queryKey: ["topics", "EVENT", bibleVersion],
    queryFn: () => getTopicsByCategory("EVENT", bibleVersion),
    enabled: hasFilter && backendCategory !== "EVENT",
  });

  const { data: propheciesTopics, isLoading: isLoadingProphecies } = useQuery({
    queryKey: ["topics", "PROPHECY", bibleVersion],
    queryFn: () => getTopicsByCategory("PROPHECY", bibleVersion),
    enabled: hasFilter && backendCategory !== "PROPHECY",
  });

  const { data: parablesTopics, isLoading: isLoadingParables } = useQuery({
    queryKey: ["topics", "PARABLE", bibleVersion],
    queryFn: () => getTopicsByCategory("PARABLE", bibleVersion),
    enabled: hasFilter && backendCategory !== "PARABLE",
  });

  // Combine all topics when filtering
  const allTopics = hasFilter
    ? [
        ...(currentCategoryTopics || []),
        ...(eventsTopics || []),
        ...(propheciesTopics || []),
        ...(parablesTopics || []),
      ]
    : currentCategoryTopics || [];

  const isLoading = hasFilter
    ? isLoadingCurrent ||
      isLoadingEvents ||
      isLoadingProphecies ||
      isLoadingParables
    : isLoadingCurrent;

  const error = errorCurrent;

  const { saveSearchParams } = useSaveSearchParams();

  const handleTopicClick = (topicId: string) => {
    // Navigate to topic view using the same system as Bible chapters
    // We use a special bookId format and testament to indicate this is a topic
    saveSearchParams({
      bookId: topicId, // Use the actual topic ID
      verseId: "1",
      testament: "TOPIC" as any, // Special value to indicate topic view
    });

    // Close the mobile dropdown
    const closeEvent = new CustomEvent("closeDropdownBook");
    window.dispatchEvent(closeEvent);

    // Execute the callback if provided (for desktop dropdown)
    onTopicClick?.();
  };

  if (isLoading) {
    return <p style={{ padding: "16px" }}>Loading topics...</p>;
  }

  if (error) {
    return (
      <p style={{ padding: "16px", color: "red" }}>
        Error loading topics: {(error as Error).message}
      </p>
    );
  }

  // Handle empty state
  if (!allTopics || allTopics.length === 0) {
    return <p style={{ padding: "16px" }}>No topics found in this category.</p>;
  }

  // Remove duplicate topics by name and apply the filter
  const filteredTopics = allTopics
    .reduce((acc: any[], current: any) => {
      const duplicate = acc.find((topic) => topic.name === current.name);
      if (!duplicate) {
        acc.push(current);
      }
      return acc;
    }, [])
    .filter((topic: any) =>
      topic.name.toLowerCase().includes(filter.toLowerCase()),
    );

  return (
    <Accordion.Root>
      {filteredTopics.map((topic: any) => (
        <Accordion.Item value={topic.topic_id} key={topic.topic_id}>
          <div
            onClick={() => handleTopicClick(topic.topic_id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleTopicClick(topic.topic_id);
              }
            }}
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
          >
            <Accordion.Trigger label={topic.name} highlightBook={false} />
          </div>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
};
