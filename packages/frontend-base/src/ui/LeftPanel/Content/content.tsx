import type TestamentEnum from "database/src/models/public/TestamentEnum";
import type { SwipeableHandlers } from "react-swipeable";
import * as Icon from "../../../ui/Icons";
import { MainText } from "../../MainText";
import { ProgressBar } from "../../ProgressBar";
import styles from "./content.module.css";

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
  handleNextChapter: () => void;
  handlePreviousChapter: () => void;
  progress: number;
  handleDesktopSwipe: SwipeableHandlers;
};

export const Content = ({
  bookVerseData,
  chapters,
  bookId,
  verseId,
  handleNextChapter,
  handlePreviousChapter,
  progress,
  handleDesktopSwipe,
}: Props) => {
  return (
    <>
      {bookVerseData && (
        <div
          className={`${styles.bookContent}`}
          data-scroll-container="main"
          {...handleDesktopSwipe}
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
              type="button"
              className={styles.previousChapterBtn}
              onClick={handlePreviousChapter}
            >
              <Icon.ChevronBackward className={styles.chevronBackward} />
            </button>
          )}

          {chapters && Number(verseId) < chapters && (
            <button
              type="button"
              className={styles.nextChapterBtn}
              onClick={handleNextChapter}
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
