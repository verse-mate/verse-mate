import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useEffect, useRef, useState } from "react";
import type { SwipeableHandlers } from "react-swipeable";
import * as Icon from "../../../ui/Icons";
import { MainText } from "../../MainText";
import { ProgressBar } from "../../ProgressBar";
import styles from "./content.module.css";

import { useChapter } from "../../../hooks/useChapter";

type Props = {
  bookVerseData:
    | {
        bookId: number;
        name: string;
        testament: TestamentEnum;
        genre: {
          g: number;
          n: string | null;
        };
        chapters: {
          chapterNumber: number;
          subtitles: {
            start_verse: number;
            end_verse: number;
            subtitle: string;
          }[];
          verses: {
            verseNumber: number;
            text: string;
          }[];
        }[];
      }
    | null
    | undefined;
  chapters?: number;
  bookId: number;
  verseId: number;
  progress: number;
  handleDesktopSwipe: SwipeableHandlers;
  buttonsVisible: boolean;
  onNextChapterClick: () => void;
  onPrevChapterClick: () => void;
};

export const Content = ({
  bookVerseData,
  chapters,
  bookId,
  verseId,
  progress,
  handleDesktopSwipe,
  buttonsVisible,
  onNextChapterClick,
  onPrevChapterClick,
}: Props) => {
  // Preserve proximity functionality from first version
  const nextChapterButtonRef = useRef<HTMLButtonElement>(null);
  const prevChapterButtonRef = useRef<HTMLButtonElement>(null);
  const [isNearNext, setIsNearNext] = useState(false);
  const [isNearPrev, setIsNearPrev] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (window.innerWidth < 1024) return;

      const checkProximity = (
        buttonRef: React.RefObject<HTMLButtonElement>,
        setIsNear: React.Dispatch<React.SetStateAction<boolean>>,
      ) => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const distance = Math.sqrt(
            (e.clientX - centerX) ** 2 + (e.clientY - centerY) ** 2,
          );
          setIsNear(distance < 150);
        } else {
          setIsNear(false);
        }
      };

      checkProximity(nextChapterButtonRef, setIsNearNext);
      checkProximity(prevChapterButtonRef, setIsNearPrev);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <>
      {bookVerseData && (
        <div className={`${styles.bookContent}`} {...handleDesktopSwipe}>
          <MainText.Root>
            <MainText.Content
              bookId={String(bookId)}
              verseId={String(verseId)}
              book={bookVerseData}
            />
          </MainText.Root>
          {chapters && Number(verseId) > 1 && (
            <button
              ref={prevChapterButtonRef}
              type="button"
              className={`${styles.previousChapterBtn} ${!buttonsVisible && !isNearPrev ? styles.hidden : ""}`}
              onClick={onPrevChapterClick}
            >
              <Icon.ChevronBackward className={styles.chevronBackward} />
            </button>
          )}

          {chapters && Number(verseId) < chapters && (
            <button
              ref={nextChapterButtonRef}
              type="button"
              className={`${styles.nextChapterBtn} ${!buttonsVisible && !isNearNext ? styles.hidden : ""}`}
              onClick={onNextChapterClick}
            >
              <Icon.ChevronForward className={styles.chevronForward} />
            </button>
          )}
        </div>
      )}
      {bookVerseData && (
        <ProgressBar.Root>
          <ProgressBar.IndicatorBackground>
            <ProgressBar.Indicator value={progress} />
          </ProgressBar.IndicatorBackground>
          <ProgressBar.Label value={progress} />
        </ProgressBar.Root>
      )}
    </>
  );
};
