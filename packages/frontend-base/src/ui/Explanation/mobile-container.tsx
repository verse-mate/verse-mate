"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import animationStyles from "../../Main/Content/main-content.module.css";
import { useChapter } from "../../hooks/useChapter";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { Content } from "./content";
import styles from "./explanation.module.css";
import { NavHeader } from "./nav";

type Props = {
  chapters?: number;
  explanation: any;
};

export const MobileContainer = ({ chapters, explanation }: Props) => {
  const { handleNextChapter, handlePreviousChapter } = useChapter();
  const totalChapters = Number(chapters);
  const queryClient = useQueryClient();
  const { bookId, verseId, explanationType, bibleVersion } =
    useGetSearchParams();

  const [visibleExplanations, setVisibleExplanations] = useState<any[]>([]);
  const isAnimating = useRef(false);
  const pendingNav = useRef<"next" | "prev" | null>(null);

  useEffect(() => {
    if (explanation && !isAnimating.current) {
      setVisibleExplanations([
        { ...explanation, key: `${bookId}-${verseId}`, className: "" },
      ]);
    }
  }, [explanation, bookId, verseId]);

  const handleAnimationEnd = useCallback(() => {
    isAnimating.current = false;
    setVisibleExplanations((prev) => {
      if (prev.length > 1) {
        return [prev[prev.length - 1]];
      }
      return prev;
    });
    if (pendingNav.current === "next") handleNextChapter(totalChapters);
    if (pendingNav.current === "prev") handlePreviousChapter();
    pendingNav.current = null;
  }, [handleNextChapter, handlePreviousChapter, totalChapters]);

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (isAnimating.current) return;
      const currentId = Number(verseId);
      if (!Number.isFinite(currentId)) return;
      const nextVerseId = currentId + 1;
      if (!chapters || nextVerseId > chapters) return;

      const nextExplanationData = queryClient.getQueryData([
        "explanation",
        bookId,
        nextVerseId,
        explanationType,
        bibleVersion,
      ]);

      if (!nextExplanationData) {
        handleNextChapter(totalChapters);
        return;
      }

      pendingNav.current = "next";
      isAnimating.current = true;
      setVisibleExplanations((prev) => [
        { ...prev[0], className: (animationStyles as any).slideOutLeft },
        {
          ...(nextExplanationData as object),
          key: `${bookId}-${nextVerseId}`,
          className: (animationStyles as any).slideInRight,
        },
      ]);
    },
    onSwipedRight: () => {
      if (isAnimating.current) return;
      const currentId = Number(verseId);
      if (!Number.isFinite(currentId)) return;
      const prevVerseId = currentId - 1;
      if (prevVerseId < 1) return;

      const prevExplanationData = queryClient.getQueryData([
        "explanation",
        bookId,
        prevVerseId,
        explanationType,
        bibleVersion,
      ]);

      if (!prevExplanationData) {
        handlePreviousChapter();
        return;
      }

      pendingNav.current = "prev";
      isAnimating.current = true;
      setVisibleExplanations((prev) => [
        { ...prev[0], className: (animationStyles as any).slideOutRight },
        {
          ...(prevExplanationData as object),
          key: `${bookId}-${prevVerseId}`,
          className: (animationStyles as any).slideInLeft,
        },
      ]);
    },
    trackMouse: false,
    preventScrollOnSwipe: false,
    delta: 40,
    swipeDuration: 500,
  });

  return (
    <>
      <NavHeader />
      <div
        {...swipeHandlers}
        className={styles.explanationContent}
        style={{ position: "relative", overflow: "hidden" }}
      >
        {visibleExplanations.map((exp, index) => (
          <div
            key={exp.key}
            className={`${exp.className} ${styles.explanationContent} ${styles.mobileExplanationContent}`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: index + 1,
              overflowY: "auto",
              padding: "inherit", // Inherit padding from parent
            }}
            onAnimationEnd={index === 0 ? handleAnimationEnd : undefined}
          >
            <Content explanation={exp} />
          </div>
        ))}
      </div>
    </>
  );
};
