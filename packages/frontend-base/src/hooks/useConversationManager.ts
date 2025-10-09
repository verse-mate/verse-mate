import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "backend-api";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useCallback, useEffect, useState } from "react";
import type { UserSession } from "./session";
import { useGetSearchParams, useSaveSearchParams } from "./useSearchParams";

export const useConversationManager = (session: UserSession | null) => {
  const queryClient = useQueryClient();
  const { saveSearchParams } = useSaveSearchParams();
  const { conversationId } = useGetSearchParams();
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(conversationId);

  const { data: conversationsHistory } = useQuery({
    queryKey: ["conversationsHistory"],
    queryFn: async () => {
      if (!session?.id) return [];
      const response = await api.bible.book["conversations-history"].post({
        session: { id: session.id },
      });
      if (response.error) {
        throw response.error;
      }
      return response.data?.userChatHistory;
    },
    enabled: !!session,
  });

  const { data: conversationMessages } = useQuery({
    queryKey: ["conversationMessages", selectedConversation],
    queryFn: async () => {
      if (!selectedConversation || !session?.id) return [];
      const response = await api.bible.book["messages-history"].post({
        conversation_id: Number(selectedConversation),
        session: { id: session?.id },
      });
      if (response.error) {
        throw response.error;
      }
      return response.data?.messagesHistory;
    },
    enabled:
      !!selectedConversation && !!session && selectedConversation !== "newChat",
  });

  const handleChatExists = useCallback(
    async ({
      book_id,
      chapter_number,
    }: { book_id: number; chapter_number: number }) => {
      if (!session?.id) return;

      const { data, error } = await api.bible.book["conversation-exists"].post({
        user_id: session?.id,
        book_id,
        chapter_number,
      });

      if (error) return { chatExists: null };
      if (!Array.isArray(data?.chatExists) || data.chatExists.length === 0)
        return { chatExists: null };

      return { chatExists: data.chatExists };
    },
    [session],
  );

  const selectConversation = useCallback(
    ({
      conversationId,
      bookId,
      verseId,
      testament,
    }: {
      conversationId: string;
      bookId: string;
      verseId: string;
      testament: TestamentEnum;
    }) => {
      saveSearchParams({ conversationId, bookId, verseId, testament });
      setSelectedConversation(conversationId);
      queryClient.invalidateQueries({ queryKey: ["conversationMessages"] });
    },
    [saveSearchParams, queryClient],
  );

  useEffect(() => {
    if (conversationId) {
      setSelectedConversation(conversationId);
    }
  }, [conversationId]);

  const saveUserMessage = useCallback(
    async ({ message, chat_id }: { message: string; chat_id: number }) => {
      if (!selectedConversation) return;
      const saveUserMessage = await api.bible.book["ask-verse-mate"][
        "save-user-message"
      ].post({
        chat_id: chat_id,
        content: message,
      });

      if (saveUserMessage.error) {
        throw saveUserMessage.error;
      }

      queryClient.invalidateQueries({ queryKey: ["conversationMessages"] });
      queryClient.invalidateQueries({ queryKey: ["conversationsHistory"] });

      return saveUserMessage.data?.result?.message_id;
    },
    [selectedConversation, queryClient],
  );

  const saveAiMessageMutation = useMutation({
    mutationKey: ["saveAiMessage"],
    mutationFn: async ({
      message,
      bookId,
      chapterId,
    }: { message: string; bookId: string; chapterId: string }) => {
      if (!selectedConversation) return;
      const saveAiMessage = await api.bible.book["ask-verse-mate"][
        "save-ai-message"
      ].post({
        chat_id: Number(selectedConversation),
        content: message,
        book_id: Number(bookId),
        chapter_number: Number(chapterId),
      });
      if (saveAiMessage.error) {
        throw saveAiMessage.error;
      }
      return saveAiMessage.data?.result?.message_id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversationMessages"] });
      queryClient.invalidateQueries({ queryKey: ["conversationsHistory"] });
    },
  });

  return {
    handleChatExists,
    conversationsHistory,
    conversationMessages,
    selectConversation,
    saveUserMessage,
    saveAiMessage: saveAiMessageMutation.mutateAsync,
  };
};
