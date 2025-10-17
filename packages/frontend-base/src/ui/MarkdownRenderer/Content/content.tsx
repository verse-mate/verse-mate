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
  language?: string;
};

const isRtlLang = (lang?: string) => {
  if (!lang) return false;
  const rtlLangs = ["ar", "he", "fa", "ur", "ps", "dv", "ku", "sd", "ug", "yi"];
  return rtlLangs.includes(lang.split("-")[0].toLowerCase());
};

export const Renderer = ({
  markdownContent,
  className,
  language,
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

  const direction = isRtlLang(language) ? "rtl" : "ltr";

  return (
    <div dir={direction} lang={language}>
      <ReactMarkdown
        className={`${styles.markdown} ${className}`}
        components={{
          h2: ({ node, ...props }) => (
            <h2 style={{ marginTop: "32px", marginBottom: "4px" }} {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 style={{ marginTop: "1em" }} {...props} />
          ),
          p: ({ node, children, ...props }) => {
            // Check if this paragraph is a reference line (starts with '(' and ends with ')')
            const textContent = node?.children
              ?.map((child: any) => child.value || "")
              .join("")
              .trim();
            const isReference =
              textContent?.startsWith("(") && textContent.endsWith(")");

            // Filter out empty paragraphs (they're from blank lines used for markdown spacing)
            if (!textContent) {
              return null;
            }

            return (
              <p
                className={isReference ? (styles as any).reference : undefined}
                {...props}
              >
                {children}
              </p>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
