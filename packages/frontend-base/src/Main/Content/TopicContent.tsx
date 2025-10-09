import { useSaveSearchParams } from "../../hooks/useSearchParams";
import { useTopicsByCategory } from "../../hooks/useTopics";
import { Accordion } from "../../ui/Accordion";
import styles from "./main-content.module.css";

interface TopicContentProps {
  category: string;
  filter: string;
}

export const TopicContent: React.FC<TopicContentProps> = ({
  category,
  filter,
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

  const { topics, isLoading, error } = useTopicsByCategory(backendCategory);
  const { saveSearchParams } = useSaveSearchParams();

  const handleTopicClick = (topicId: string) => {
    // Navigate to topic view using the same system as Bible chapters
    // We use a special bookId format and testament to indicate this is a topic
    saveSearchParams({
      bookId: topicId, // Use the actual topic ID
      verseId: "1",
      testament: "TOPIC" as any, // Special value to indicate topic view
    });

    // Close the dropdown
    const closeEvent = new CustomEvent("closeDropdownBook");
    window.dispatchEvent(closeEvent);
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
  if (!topics || topics.length === 0) {
    return <p style={{ padding: "16px" }}>No topics found in this category.</p>;
  }

  // Remove duplicate topics by name and apply the filter
  const filteredTopics = topics
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
