import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getTopicDetails, getTopicExplanation } from "../../api/topics";
import { useGetSearchParams } from "../../hooks/useSearchParams";
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
  const { bibleVersion } = useGetSearchParams();
  const [activeExplanationTab, setActiveExplanationTab] = useState<
    "summary" | "byline" | "detailed"
  >("summary");

  const {
    data: topicDetails,
    isLoading: isTopicLoading,
    error: topicError,
  } = useQuery({
    queryKey: ["topic-details", topicId],
    queryFn: () => getTopicDetails(topicId),
    enabled: !!topicId,
  });

  // Fetch explanations only when their tab is active
  const { data: summaryExplanation, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["topic-explanation", topicId, "summary"],
    queryFn: () => getTopicExplanation(topicId, "summary"),
    enabled: !!topicId && activeExplanationTab === "summary",
  });

  const { data: bylineExplanation, isLoading: isBylineLoading } = useQuery({
    queryKey: ["topic-explanation", topicId, "byline"],
    queryFn: () => getTopicExplanation(topicId, "byline"),
    enabled: !!topicId && activeExplanationTab === "byline",
  });

  const { data: detailedExplanation, isLoading: isDetailedLoading } = useQuery({
    queryKey: ["topic-explanation", topicId, "detailed"],
    queryFn: () => getTopicExplanation(topicId, "detailed"),
    enabled: !!topicId && activeExplanationTab === "detailed",
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
      parseVerses({ content: contentToParse, bibleVersion });
    }
  }, [contentToParse, parseVerses, bibleVersion]);

  const isLoadingExplanation =
    (activeExplanationTab === "summary" && isSummaryLoading) ||
    (activeExplanationTab === "byline" && isBylineLoading) ||
    (activeExplanationTab === "detailed" && isDetailedLoading);

  const hasError = topicError;

  if (isTopicLoading) {
    return <p>Loading topic details...</p>;
  }

  if (hasError) {
    return <p>Error loading topic details.</p>;
  }

  const getExplanationData = () => {
    switch (activeExplanationTab) {
      case "summary":
        return summaryExplanation?.explanation || "";
      case "byline":
        return bylineExplanation?.explanation || "";
      case "detailed":
        return detailedExplanation?.explanation || "";
      default:
        return "";
    }
  };

  return (
    <div>
      <button type="button" onClick={onBack}>
        Back to list
      </button>
      <h2>{topicDetails?.topic?.name}</h2>
      <div>
        <h3>References</h3>
        {parsedContent ? (
          <Renderer markdownContent={parsedContent} variant="bible-text" />
        ) : (
          <p>Parsing...</p>
        )}
      </div>
      <div>
        <h3>Explanation</h3>
        <div>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
            <button
              type="button"
              onClick={() => setActiveExplanationTab("summary")}
              style={{
                padding: "0.5rem 1rem",
                border: "1px solid #ccc",
                borderRadius: "0.25rem",
                cursor: "pointer",
                backgroundColor:
                  activeExplanationTab === "summary" ? "#eee" : "transparent",
              }}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveExplanationTab("byline")}
              style={{
                padding: "0.5rem 1rem",
                border: "1px solid #ccc",
                borderRadius: "0.25rem",
                cursor: "pointer",
                backgroundColor:
                  activeExplanationTab === "byline" ? "#eee" : "transparent",
              }}
            >
              Byline
            </button>
            <button
              type="button"
              onClick={() => setActiveExplanationTab("detailed")}
              style={{
                padding: "0.5rem 1rem",
                border: "1px solid #ccc",
                borderRadius: "0.25rem",
                cursor: "pointer",
                backgroundColor:
                  activeExplanationTab === "detailed" ? "#eee" : "transparent",
              }}
            >
              Detailed
            </button>
          </div>

          {isLoadingExplanation ? (
            <p>Loading {activeExplanationTab} explanation...</p>
          ) : getExplanationData() ? (
            <Renderer markdownContent={getExplanationData()} />
          ) : (
            <p>No {activeExplanationTab} explanation available.</p>
          )}
        </div>
      </div>
    </div>
  );
};
