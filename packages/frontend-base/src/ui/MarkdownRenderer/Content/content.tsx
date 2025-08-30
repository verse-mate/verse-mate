import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import styles from "./content.module.css";

type MarkdownRendererProps = {
  markdownContent:
    | {
        error?: string;
        explanation?: string | null;
      }
    | string;
  className?: string;
};

export const Renderer = ({
  markdownContent,
  className,
}: MarkdownRendererProps) => {
  const [content, setContent] = useState<string>("");

  useEffect(() => {
    const loadContent = async () => {
      let rawContent = "";

      if (typeof markdownContent === "string") {
        rawContent = markdownContent;
      } else if (markdownContent?.error) {
        rawContent = markdownContent.error;
      } else if (markdownContent?.explanation) {
        rawContent = markdownContent.explanation;
      }

      const cleanedContent = rawContent
        .replace(/^```markdown\s*/, "") // Remove ```markdown at the start
        .replace(/```$/, ""); // Remove ``` at the end
      setContent(cleanedContent);
    };

    loadContent();
  }, [markdownContent]);

  return (
    <ReactMarkdown
      className={`${styles.markdown} ${className}`}
      components={{
        h2: ({ node, ...props }) => (
          <h2 style={{ marginTop: "2em" }} {...props} />
        ),
        h3: ({ node, ...props }) => (
          <h3 style={{ marginTop: "1em" }} {...props} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
