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
  variant?: "default" | "bible-text"; // default = grayish text, bible-text = white text
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
  variant = "default",
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
  const variantClass = variant === "bible-text" ? styles.bibleText : "";

  return (
    <div dir={direction} lang={language}>
      <ReactMarkdown
        className={`${styles.markdown} ${variantClass} ${className}`}
        components={{
          h2: ({ node, ...props }) => <h2 {...props} />,
          h3: ({ node, ...props }) => <h3 {...props} />,
          h4: ({ node, ...props }) => <h4 {...props} />,
          p: ({ node, ...props }) => {
            const childrenArray = Array.isArray((node as any)?.children)
              ? (node as any).children
              : [];
            const textContent = childrenArray
              .map((child: any) =>
                child?.type === "text" ? String(child.value ?? "") : "",
              )
              .join("")
              .trim();

            if (!textContent) {
              return null;
            }

            if (textContent.startsWith("(") && textContent.endsWith(")")) {
              return <p className={styles.referenceText} {...props} />;
            }

            return <p {...props} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
