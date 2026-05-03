/**
 * @deprecated D-009 + D-014 — Q&A feature removed; frontend-next is admin-only.
 *
 * This file is part of the user-facing Bible reader Chat / Q&A flow that has
 * been deprecated per Phase 1 decision D-009 (Q&A removed entirely) AND
 * Epic 12 (frontend-next scoped to admin-only).
 *
 * Removal is pending — companion PR to "feat: drop Q&A entirely" (#204) will
 * delete this file along with the Chat UI and migrate consumers in
 * main-content.tsx, RightPanel, Header.
 *
 * Do NOT add new code here; do NOT add new callers.
 */

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
