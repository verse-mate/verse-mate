import { useState } from "react";
import { useTopicsByCategory } from "../../hooks/useTopics";
import { Accordion } from "../../ui/Accordion";
import { TopicDetail } from "./TopicDetail";
import styles from "./main-content.module.css";

interface TopicContentProps {
  category: string;
}

export const TopicContent: React.FC<TopicContentProps> = ({ category }) => {
  const { topics, isLoading, error } = useTopicsByCategory(category);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const handleTopicClick = (topicId: string) => {
    setSelectedTopicId(topicId);
  };

  if (isLoading) {
    return <p>Loading topics...</p>;
  }

  if (error) {
    return <p>Error loading topics.</p>;
  }

  if (selectedTopicId) {
    return (
      <TopicDetail
        topicId={selectedTopicId}
        onBack={() => setSelectedTopicId(null)}
      />
    );
  }

  return (
    <div className={styles.contentGroupedTrigger}>
      <Accordion.Root>
        {topics?.map((topic: any) => (
          <Accordion.Item value={topic.name} key={topic.topic_id}>
            <div
              onClick={() => handleTopicClick(topic.topic_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleTopicClick(topic.topic_id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <Accordion.Trigger label={topic.name} highlightBook={false} />
            </div>
            <Accordion.Content>
              <p>{topic.description}</p>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </div>
  );
};
