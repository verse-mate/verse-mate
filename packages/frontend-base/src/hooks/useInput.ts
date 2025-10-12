"use client";

import { useQueryClient } from "@tanstack/react-query";
import { api } from "backend-api";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { useConversationManager } from "./useConversationManager";
import { useGetSearchParams } from "./useSearchParams";
import { userSession } from "./userSession";

export type Message = {
  role: "user" | "assistant";
  content: { content: string } | string;
};

export const useInput = () => {
  const queryClient = useQueryClient();
  const { bookId, verseId, conversationId } = useGetSearchParams();
  const [inputValue, setInputValue] = useState("");
  const [lastSendMessage, setLastSentMessage] = useState("");
  const [isFocused, setIsFocusedState] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { session } = userSession();
  const { saveUserMessage, saveAiMessage } = useConversationManager(session);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!session?.id || !inputValue || !bookId || !verseId || !conversationId)
      return;

    // check if this conversation_id exists

    // non-exists
    if (conversationId === "newChat") {
      // get the user_id, book_id, chapter_number and user message,
      // then create a new chat
      const newChat = await api.bible.book["new-conversation"].post({
        user_id: session.id,
        book_id: Number(bookId),
        chapter_number: verseId,
        content: inputValue,
      });

      if (newChat.error) {
        throw newChat.error;
      }

      try {
        const userMessageSaved = await saveUserMessage({
          message: inputValue,
          chat_id: Number(newChat.data?.newConversation?.chat_id),
        });
        if (userMessageSaved) {
          queryClient.invalidateQueries({ queryKey: ["conversationMessages"] });
          queryClient.invalidateQueries({ queryKey: ["conversationsHistory"] });
          // save response
          const aiMessage = await saveAiMessage({
            message: inputValue,
            bookId: String(bookId),
            chapterId: String(verseId),
          });
          if (aiMessage) {
            queryClient.invalidateQueries({
              queryKey: ["conversationMessages"],
            });
            queryClient.invalidateQueries({
              queryKey: ["conversationsHistory"],
            });
          }
        }
      } catch {
        const errorMessage = {
          role: "error",
          content: "Error processing request",
        };
        queryClient.setQueryData(
          ["conversationMessages"],
          (oldData: Message[]) => [...(oldData || []), errorMessage],
        );
      } finally {
        // invalidate queries
        setLastSentMessage(inputValue);
        queryClient.invalidateQueries({ queryKey: ["conversationMessages"] });
        queryClient.invalidateQueries({ queryKey: ["conversationsHistory"] });
      }
    }
    // exists
    else {
      // invalidate queries
      try {
        // save user message
        // send user message to get a response
        const userMessageSaved = await saveUserMessage({
          message: inputValue,
          chat_id: Number(conversationId),
        });
        if (userMessageSaved) {
          queryClient.invalidateQueries({ queryKey: ["conversationMessages"] });
          queryClient.invalidateQueries({ queryKey: ["conversationsHistory"] });
          // save response
          const aiMessage = await saveAiMessage({
            message: inputValue,
            bookId: String(bookId),
            chapterId: String(verseId),
          });
          if (aiMessage) {
            queryClient.invalidateQueries({
              queryKey: ["conversationMessages"],
            });
            queryClient.invalidateQueries({
              queryKey: ["conversationsHistory"],
            });
          }
        }
      } catch {
        const errorMessage = {
          role: "error",
          content: "Error processing request",
        };
        queryClient.setQueryData(
          ["conversationMessages"],
          (oldData: Message[]) => [...(oldData || []), errorMessage],
        );
      } finally {
        // invalidate queries
        setLastSentMessage(inputValue);
        queryClient.invalidateQueries({ queryKey: ["conversationMessages"] });
        queryClient.invalidateQueries({ queryKey: ["conversationsHistory"] });
      }
    }
  };

  const handleClearInput = () => {
    setInputValue("");
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const isLastMessageSameAsInput = inputValue === lastSendMessage;

  return {
    isHovered,
    isFocused,
    inputValue,
    isLastMessageSameAsInput,
    setIsFocusedState,
    handleChange,
    handleSubmit,
    handleClearInput,
    handleMouseEnter,
    handleMouseLeave,
  };
};
