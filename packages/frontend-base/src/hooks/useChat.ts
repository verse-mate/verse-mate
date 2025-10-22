import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "backend-api";
import { useCallback, useState } from "react";
import { useConversationManager } from "./useConversationManager";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";
import { userSession } from "./userSession";

type Message = {
  role: "user" | "assistant" | "error";
  content: string;
};

export const useChat = () => {
  const { session } = userSession();
  const [input, setInput] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const { bookId, verseId, conversationId } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();
  const { saveUserMessage, saveAiMessage } = useConversationManager(session);
  const queryClient = useQueryClient();

  const messageMutation = useMutation({
    mutationKey: ["sendingMessage"],
    mutationFn: async (userMessage: string) => {
      if (!session?.id || !bookId || !verseId || !conversationId) {
        throw new Error("Missing required parameters");
      }

      let currentConversationId = conversationId;

      if (currentConversationId === "newChat") {
        const newChat = await api.bible.book["new-conversation"].post({
          user_id: session.id,
          book_id: Number(bookId),
          chapter_number: verseId,
          content: userMessage,
        });

        if (newChat.error) {
          throw newChat.error;
        }

        currentConversationId = String(newChat.data?.newConversation?.chat_id);
        saveSearchParams({ conversationId: currentConversationId });

        const previousMessages = queryClient.getQueryData<Message[]>([
          "conversationMessages",
          "newChat",
        ]);

        if (previousMessages) {
          queryClient.setQueryData(
            ["conversationMessages", currentConversationId],
            previousMessages,
          );
          queryClient.removeQueries({
            queryKey: ["conversationMessages", "newChat"],
          });
        }
      }

      await saveUserMessage({
        message: userMessage,
        chat_id: Number(currentConversationId),
      });

      const aiResponse = await saveAiMessage({
        message: userMessage,
        bookId: String(bookId),
        chapterId: String(verseId),
      });

      return { aiResponse, conversationId: currentConversationId };
    },
    onMutate: async (userMessage: string) => {
      await queryClient.cancelQueries({
        queryKey: ["conversationMessages", conversationId],
      });

      const previousMessages = queryClient.getQueryData<Message[]>([
        "conversationMessages",
        conversationId,
      ]);

      queryClient.setQueryData<Message[]>(
        ["conversationMessages", conversationId],
        (old = []) => [...old, { role: "user", content: userMessage }],
      );

      return { previousMessages };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<Message[]>(
        ["conversationMessages", data.conversationId],
        (old = []) => [
          ...old,
          { role: "assistant", content: String(data.aiResponse) },
        ],
      );
    },
    onError: (_error, _userMessage, context) => {
      queryClient.setQueryData(
        ["conversationMessages", conversationId],
        context?.previousMessages,
      );

      queryClient.setQueryData<Message[]>(
        ["conversationMessages", conversationId],
        (old = []) => [
          ...old,
          { role: "error", content: "Error processing request" },
        ],
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["conversationsHistory"] });
    },
  });

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmedInput = input.trim();
      if (!trimmedInput || !session?.id || !bookId || !verseId) return;

      messageMutation.mutate(trimmedInput);
      setInput("");
    },
    [input, messageMutation, session, bookId, verseId],
  );

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return {
    isHovered,
    handleMouseEnter,
    handleMouseLeave,
    input,
    handleInputChange,
    handleSubmit,
    isLoading: messageMutation.isPending,
  };
};
