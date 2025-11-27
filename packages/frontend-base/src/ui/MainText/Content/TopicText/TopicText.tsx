import { useMemo } from "react";
import {
  type ParsedTopicContent,
  parseTopicMarkdown,
} from "../../../../utils/parseTopicMarkdown";
import styles from "../Text/text.module.css";

interface TopicTextProps {
  topicName: string;
  markdownContent: string;
}

export const TopicText = ({ topicName, markdownContent }: TopicTextProps) => {
  // Parse the markdown content into structured data
  const parsedContent: ParsedTopicContent = useMemo(() => {
    return parseTopicMarkdown(markdownContent);
  }, [markdownContent]);

  // Helper function to render reference list with non-breaking references
  const renderReferenceList = (referenceList: string) => {
    // Remove outer parentheses if present
    const cleanList = referenceList.replace(/^\(|\)$/g, "");
    // Split by comma but keep each reference together
    const refs = cleanList.split(",").map((ref) => ref.trim());

    return (
      <p className={styles.subtitleReference}>
        (
        {refs.map((ref, idx) => (
          <span key={ref} style={{ whiteSpace: "nowrap" }}>
            {ref}
            {idx < refs.length - 1 && ", "}
          </span>
        ))}
        )
      </p>
    );
  };

  return (
    <section className={styles.contentBox}>
      {/* Topic title */}
      <div className={styles.titleContainer}>
        <h1 className={styles.title}>{topicName}</h1>
      </div>

      {/* Render each subtitle section */}
      {parsedContent.subtitles.map((section, index) => (
        <div key={`${section.subtitle}-${index}`} className={styles.textBox}>
          {/* Subtitle */}
          <div className={styles.subtitleBox}>
            <h2 className={styles.subtitle}>{section.subtitle}</h2>
            {/* Reference list under subtitle (grayed out) */}
            {section.referenceList &&
              renderReferenceList(section.referenceList)}
          </div>

          {/* Verses container */}
          <div className={styles.versesContainer}>
            {section.verses.map((verse, verseIndex) => (
              <span
                key={`${verse.verseNumber}-${verse.reference}-${verseIndex}`}
                className={styles.verse}
              >
                {/* Verse number as superscript */}
                <sup className={styles.verseNumber}>{verse.verseNumber}</sup>
                {/* Verse text */}
                <span className={styles.verseText}>
                  {verse.text}
                  {/* Reference citation (grayed out) - only show if reference exists */}
                  {verse.reference && (
                    <>
                      {" "}
                      <span className={styles.verseReference}>
                        ({verse.reference})
                      </span>
                    </>
                  )}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};
