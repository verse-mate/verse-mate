import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getTopicDetails } from "../../api/topics";
import { useVerseParser } from "../../hooks/useVerseParser";
import { Renderer } from "../../ui/MarkdownRenderer/Content/content";

interface TopicDetailProps {
  topicId: string;
  onBack: () => void;
}

export const TopicDetail: React.FC<TopicDetailProps> = ({
  topicId,
  onBack,
}) => {
  const {
    data: topicDetails,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["topic-details", topicId],
    queryFn: () => getTopicDetails(topicId),
    enabled: !!topicId,
  });

  const { mutate: parseVerses, data: parsedContent } = useVerseParser();
  const [contentToParse, setContentToParse] = useState<string | null>(null);

  useEffect(() => {
    if (topicDetails?.references?.content) {
      setContentToParse(topicDetails.references.content);
    }
  }, [topicDetails]);

  useEffect(() => {
    if (contentToParse) {
      parseVerses({ content: contentToParse, bibleVersion: "NASB1995" });
    }
  }, [contentToParse, parseVerses]);

  if (isLoading) {
    return <p>Loading topic details...</p>;
  }

  if (error) {
    return <p>Error loading topic details.</p>;
  }

  return (
    <div>
      <button type="button" onClick={onBack}>
        Back to list
      </button>
      <h2>{topicDetails?.topic?.name}</h2>
      <div>
        <h3>References</h3>
        {parsedContent ? (
          <Renderer markdownContent={parsedContent} />
        ) : (
          <p>Parsing...</p>
        )}
      </div>
      <div>
        <h3>Explanation</h3>
        <pre>{JSON.stringify(topicDetails?.explanation, null, 2)}</pre>
      </div>
    </div>
  );
};
