import { useQuery } from "@tanstack/react-query";
import { api } from "backend-api";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UserSession } from "./session";

type LastRead = {
  result: {
    book_id: number;
    chapterNumber: number;
    bookName: string;
    testament: "OT" | "NT";
    explanation: {
      book_id: number;
      chapter_number: number;
      explanation_id: number | null;
      type: ExplanationTypeEnum | null;
      explanation: string | null;
    }[];
  } | null;
};

export const useLastRead = (session: UserSession | null) => {
  const [lastRead, setLastRead] = useState<LastRead | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: lastReadData, refetch } = useQuery({
    queryKey: ["last-read", session?.id],
    queryFn: async () => {
      if (!session) return null;
      const response = await api.bible.book.chapter["last-read"].post({
        user_id: session.id,
      });
      if (response.error) {
        throw response.error;
      }
      return response.data;
    },
    enabled: !!session,
  });

  useEffect(() => {
    if (lastReadData) {
      setLastRead(lastReadData);
    }
  }, [lastReadData]);

  const saveLastRead = useCallback(
    async (bookId: number, chapterId: number) => {
      if (!session) return;
      const response = await api.bible.book.chapter["save-last-read"].post({
        book_id: bookId,
        chapter_number: chapterId,
        user_id: session.id,
      });
      if (response.error) {
        throw response.error;
      }
      refetch();
    },
    [session, refetch],
  );

  const startTimer = useCallback(
    (bookId: number, chapterId: number) => {
      // clear the previous timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // start a new timer to save the last read
      timerRef.current = setTimeout(() => {
        saveLastRead(bookId, chapterId);
      }, 5000); // 5 seconds
    },
    [saveLastRead],
  );

  return {
    lastRead,
    startTimer,
  };
};
