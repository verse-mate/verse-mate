"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "backend-api";
import { useEffect, useState } from "react";
import type { UserSession } from "./session";

type useRatingType = {
  maxRating: number;
  currentRating: number;
  hoverRating: number | null;
  totalRatings: number;
  averageRating: number;
  setRating: (rating: number) => void;
  setHoverRating: (rating: number | null) => void;
};

export const useRating = (
  maxRating: number,
  session: UserSession | null,
  bookId: number,
  chapterId: number,
  explanation_id?: number | null,
): useRatingType => {
  const queryClient = useQueryClient();

  const [currentRating, setCurrentRating] = useState(0);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [totalRatings, setTotalRatings] = useState(0);
  const [averageRating, setAverageRating] = useState(0);

  const { data: ratings } = useQuery({
    queryKey: ["ratings", bookId, chapterId, explanation_id],
    queryFn: async () => {
      if (!session || !explanation_id) {
        return {
          userRating: 0,
          totalUsersWhoRated: 0,
          averageRating: 0,
        };
      }
      const response = await api.bible.book.explanation.ratings.post({
        book_id: bookId,
        chapter_number: chapterId,
        user: {
          id: session?.id,
        },
        explanation_id,
      });
      if (response.error) {
        throw response.error;
      }
      return response.data;
    },
    initialData: {
      userRating: 0,
      totalUsersWhoRated: 0,
      averageRating: 0,
    },
    enabled:
      !!session &&
      !!bookId &&
      !!chapterId &&
      !Number.isNaN(bookId) &&
      !Number.isNaN(chapterId),
  });

  useEffect(() => {
    if (ratings) {
      setCurrentRating(ratings.userRating);
      setTotalRatings(ratings.totalUsersWhoRated);
      setAverageRating(ratings.averageRating);
    }
  }, [ratings]);

  const { mutate: saveRating } = useMutation({
    mutationFn: async (rating: number) => {
      if (!session || !explanation_id) return;
      return await api.bible.book.explanation["save-rating"].post({
        book_id: bookId,
        chapter_number: chapterId,
        rating,
        user: {
          id: session?.id,
        },
        explanation_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["ratings", bookId, chapterId],
      });
    },
  });

  const { mutate: updateRating } = useMutation({
    mutationFn: async (rating: number) => {
      if (!session || !explanation_id) return;
      return await api.bible.book.explanation["update-rating"].put({
        book_id: bookId,
        chapter_number: chapterId,
        rating,
        user: {
          id: session?.id,
        },
        explanation_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["ratings", bookId, chapterId],
      });
    },
  });

  const setRating = (rating: number) => {
    setCurrentRating(rating);
    if ((ratings?.userRating ?? 0) > 0) {
      updateRating(rating);
    } else {
      saveRating(rating);
    }
  };

  return {
    maxRating,
    currentRating,
    hoverRating,
    totalRatings,
    averageRating,
    setRating,
    setHoverRating,
  };
};
