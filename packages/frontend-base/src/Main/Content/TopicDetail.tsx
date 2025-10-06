import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getTopicDetails, getTopicExplanation } from "../../api/topics";
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
    isLoading: isTopicLoading,
    error: topicError,
  } = useQuery({
    queryKey: ["topic-details", topicId],
    queryFn: () => getTopicDetails(topicId),
    enabled: !!topicId,
  });

  const { data: summaryExplanation, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["topic-explanation", topicId, "summary"],
    queryFn: () => getTopicExplanation(topicId, "summary"),
    enabled: !!topicId,
  });

  const { data: bylineExplanation, isLoading: isBylineLoading } = useQuery({
    queryKey: ["topic-explanation", topicId, "byline"],
    queryFn: () => getTopicExplanation(topicId, "byline"),
    enabled: !!topicId,
  });

  const { data: detailedExplanation, isLoading: isDetailedLoading } = useQuery({
    queryKey: ["topic-explanation", topicId, "detailed"],
    queryFn: () => getTopicExplanation(topicId, "detailed"),
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

  const isLoading =
    isTopicLoading || isSummaryLoading || isBylineLoading || isDetailedLoading;
  const hasError = topicError;

  if (isLoading) {
    return <p>Loading topic details...</p>;
  }

  if (hasError) {
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
        <div>
          <h4>Summary</h4>
          {summaryExplanation?.explanation ? (
            <Renderer markdownContent={summaryExplanation.explanation} />
          ) : (
            <p>No summary explanation available.</p>
          )}

          <h4>Byline</h4>
          {bylineExplanation?.explanation ? (
            <Renderer markdownContent={bylineExplanation.explanation} />
          ) : (
            <p>No byline explanation available.</p>
          )}

          <h4>Detailed</h4>
          {detailedExplanation?.explanation ? (
            <Renderer markdownContent={detailedExplanation.explanation} />
          ) : (
            <p>No detailed explanation available.</p>
          )}
        </div>
      </div>
    </div>
  );
};
