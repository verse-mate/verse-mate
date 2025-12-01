import ReactMarkdown from "react-markdown";
import styles from "./content.module.css";

type ContentProps = {
  content: string;
};

export const Content = ({ content }: ContentProps) => {
  return (
    <article className={styles.article}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className={styles.h1}>{children}</h1>,
          h2: ({ children }) => <h2 className={styles.h2}>{children}</h2>,
          h3: ({ children }) => <h3 className={styles.h3}>{children}</h3>,
          p: ({ children }) => <p className={styles.paragraph}>{children}</p>,
          ul: ({ children }) => <ul className={styles.list}>{children}</ul>,
          li: ({ children }) => <li className={styles.listItem}>{children}</li>,
          strong: ({ children }) => (
            <strong className={styles.strong}>{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
};
