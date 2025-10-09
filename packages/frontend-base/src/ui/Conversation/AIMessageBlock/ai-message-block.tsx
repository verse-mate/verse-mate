import { MarkdownRenderer } from "../../MarkdownRenderer";
import styles from "./ai-message-block.module.css";

type AIMessageBlockProps = {
  icon: React.ReactNode;
  message: string | React.ReactNode;
};

export const AIMessageBlock = ({ icon, message }: AIMessageBlockProps) => {
  return (
    <>
      <div className={styles.container}>
        <span className={styles.icon}>{icon}</span>
        {typeof message === "string" ? (
          <div className={styles.messageBox}>
            <MarkdownRenderer.Root>
              <MarkdownRenderer.Renderer markdownContent={message} />
            </MarkdownRenderer.Root>
          </div>
        ) : (
          <div className={styles.messageBox}>{message}</div>
        )}
      </div>
    </>
  );
};
