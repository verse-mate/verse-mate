import { useChat } from "../../hooks/useChat";
import * as Icons from "../Icons";
import { Button } from "./button";
import styles from "./chat.module.css";
import { Input } from "./input";

export const ChatInput = () => {
  const {
    isHovered,
    handleMouseEnter,
    handleMouseLeave,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
  } = useChat();

  return (
    <form onSubmit={handleSubmit} className={`${styles.chatContainer}`}>
      <div
        className={`${styles.chatContent} ${isLoading ? styles.disabled : ""}`}
      >
        <Input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask VerseMate"
          className={styles.input}
          disabled={isLoading}
        />
        <Button
          type="submit"
          disabled={isLoading}
          className={`${styles.button} ${input.trim().length > 0 ? styles.enabled : ""}`}
          handleMouseEnter={handleMouseEnter}
          handleMouseLeave={handleMouseLeave}
        >
          {isLoading ? (
            <Icons.ProgressActivity className={styles.animateSpin} />
          ) : (
            <Icons.ArrowUpIcon className={styles.icon} isHovered={isHovered} />
          )}
        </Button>
      </div>
    </form>
  );
};
