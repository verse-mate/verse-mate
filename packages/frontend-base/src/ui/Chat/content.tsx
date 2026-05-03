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

import * as RadixTabs from "@radix-ui/react-tabs";
import { useIsMutating } from "@tanstack/react-query";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useEffect, useRef } from "react";
import { useConversationManager } from "../../hooks/useConversationManager";
import { userSession } from "../../hooks/userSession";
import { History } from "../../ui/ConversationHistory";
import { Conversation } from "../Conversation";
import * as Icon from "../Icons";
import ThreeDotsLoadingIcon from "../Icons/ThreeDotsLoadingIcon/ThreeDotsLoadingIcon";
import styles from "./chat.module.css";
import { ChatInput } from "./form";
import { ScrollArea } from "./scroll-area";

export const CardContent = () => {
  const { session } = userSession();
  const { conversationMessages, conversationsHistory, selectConversation } =
    useConversationManager(session);

  const isMutating = useIsMutating({ mutationKey: ["saveAiMessage"] });
  const isSending = useIsMutating({ mutationKey: ["sendingMessage"] });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  });

  return (
    <div className={`${styles.cardContent}`}>
      <RadixTabs.Content value="chat">
        <ScrollArea>
          <Conversation.Content>
            {conversationMessages?.map((data: any, index: number) => {
              if (data.role === "user" && typeof data.content === "string") {
                return (
                  <Conversation.UserMessageBlock
                    key={index.toString()}
                    message={data.content}
                  />
                );
              }

              if (
                data.role === "assistant" &&
                typeof data.content === "string"
              ) {
                return (
                  <Conversation.AIMessageBlock
                    icon={<Icon.VerseMateIcon />}
                    key={index.toString()}
                    message={data.content}
                  />
                );
              }

              return null;
            })}
            {(isSending === 1 || isMutating === 1) && (
              <Conversation.AIMessageBlock
                icon={<Icon.VerseMateIcon />}
                message={<ThreeDotsLoadingIcon />}
              />
            )}
            <div ref={messagesEndRef} />
          </Conversation.Content>
        </ScrollArea>
        <ChatInput />
      </RadixTabs.Content>

      <RadixTabs.Content value="newChat">
        <ScrollArea>
          <Conversation.Content>
            {conversationMessages?.map((data: any, index: number) => {
              if (data.role === "user" && typeof data.content === "string") {
                return (
                  <Conversation.UserMessageBlock
                    key={index.toString()}
                    message={data.content}
                  />
                );
              }

              if (
                data.role === "assistant" &&
                typeof data.content === "string"
              ) {
                return (
                  <Conversation.AIMessageBlock
                    icon={<Icon.VerseMateIcon />}
                    key={index.toString()}
                    message={data.content}
                  />
                );
              }

              return null;
            })}
            {(isSending === 1 || isMutating === 1) && (
              <Conversation.AIMessageBlock
                icon={<Icon.VerseMateIcon />}
                message={<ThreeDotsLoadingIcon />}
              />
            )}
            <div ref={messagesEndRef} />
          </Conversation.Content>
        </ScrollArea>
        <ChatInput />
      </RadixTabs.Content>

      <RadixTabs.Content value="chatHistory">
        <div className={styles.historyContainer}>
          <History.Root>
            <History.Content>
              {!conversationsHistory ||
              Object.keys(conversationsHistory).length === 0 ? (
                <span className={styles.simpleText}>no chats</span>
              ) : (
                Object.entries(conversationsHistory).map(
                  ([key, conversation]: [string, any]) => (
                    <div key={key} className={styles.groupContainer}>
                      <History.HistoryLabel date={key} />
                      {conversation.map((data: any) => (
                        <History.HistoryButton
                          key={data.conversation_id}
                          onClick={() => {
                            selectConversation({
                              bookId: String(data.book.book_id),
                              verseId: String(data.chapter_number),
                              conversationId: String(data.conversation_id),
                              testament: data.book.testament as TestamentEnum,
                            });
                          }}
                          label={
                            data.messages && data.messages.length > 0
                              ? data.messages[data.messages.length - 1].content
                              : "No messages"
                          }
                          title={data.title}
                          conversation_id={data.conversation_id}
                        />
                      ))}
                    </div>
                  ),
                )
              )}
            </History.Content>
          </History.Root>
        </div>
      </RadixTabs.Content>
    </div>
  );
};
