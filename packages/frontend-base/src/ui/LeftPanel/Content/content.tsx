import { useEffect, useRef, useState } from "react";
import type { SwipeableHandlers } from "react-swipeable";
import { DesktopTopicView } from "../../../Main/Content/DesktopTopicView";
import { useBookIntroduction } from "../../../hooks/useBookIntroduction";
import {
  useGetSearchParams,
  useSaveSearchParams,
} from "../../../hooks/useSearchParams";
import { userSession } from "../../../hooks/userSession";
import { BookIntroduction } from "../../../ui/BookIntroduction";
import * as Icon from "../../../ui/Icons";
import { MainText } from "../../MainText";
import { ProgressBar } from "../../ProgressBar";
import styles from "./content.module.css";

type Props = {
  isViewingTopic: boolean;
  topicId: string;
  bookVerseData:
    | {
        bookId: number;
        name: string;
        testament: "OT" | "NT";
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
  scrollableCallbackRef: (node: HTMLElement | null) => void; // Made required from second version
  onNextChapterClick: () => void;
  onPrevChapterClick: () => void;
};

export const Content = ({
  isViewingTopic,
  topicId,
  bookVerseData,
  chapters,
  bookId,
  verseId,
  progress,
  handleDesktopSwipe,
  buttonsVisible,
  scrollableCallbackRef,
  onNextChapterClick,
  onPrevChapterClick,
}: Props) => {
  // Preserve proximity functionality from first version
  const nextChapterButtonRef = useRef<HTMLButtonElement>(null);
  const prevChapterButtonRef = useRef<HTMLButtonElement>(null);
  const [isNearNext, setIsNearNext] = useState(false);
  const [isNearPrev, setIsNearPrev] = useState(false);

  // Book introduction tracking
  const { showIntro } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();
  const { session } = userSession();
  const { introduction: introData, markAsViewed } = useBookIntroduction(
    !isViewingTopic && typeof bookId === "number" ? bookId : null,
    "en",
  );

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

  if (isViewingTopic) {
    // topicId is actually the category (EVENTS, PROPHECIES, PARABLES)
    // verseId is the sort_order (1, 2, 3...)
    return (
      <DesktopTopicView
        category={topicId}
        sortOrder={verseId}
        buttonsVisible={buttonsVisible}
        scrollableCallbackRef={scrollableCallbackRef}
      />
    );
  }

  // Check if we should show intro
  // Auto-popup respects hasViewedIntro via logic in MainContent;
  // manual Book Overview button should always show when showIntro is true.
  if (showIntro && bookVerseData && introData && introData.book_id === bookId) {
    const handleContinue = () => {
      markAsViewed(bookId, !!session);
      saveSearchParams({ showIntro: false });
    };

    return (
      <div className={`${styles.bookContent}`} ref={scrollableCallbackRef}>
        <BookIntroduction.Root>
          <BookIntroduction.Content content={introData.full_intro_text} />
          <BookIntroduction.Actions
            onContinue={handleContinue}
            chapterNumber={verseId}
          />
        </BookIntroduction.Root>
      </div>
    );
  }

  return (
    <>
      {bookVerseData && (
        <div
          className={`${styles.bookContent}`}
          {...handleDesktopSwipe}
          ref={scrollableCallbackRef}
        >
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
