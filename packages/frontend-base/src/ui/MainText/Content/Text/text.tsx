import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useMemo } from "react";
import { useGetSearchParams } from "../../../../hooks/useSearchParams";
import { generateShareableUrl } from "../../../../utils/sharing";
import { BookmarkButton } from "../../../Bookmarks";
import { CopyLinkButton } from "../../../CopyLinkButton";
import { ShareButton } from "../../../ShareButton";
import styles from "./text.module.css";

type Verse = {
  verseNumber: number;
  text: string;
};

type Subtitle = {
  subtitle: string;
  start_verse: number;
  end_verse: number;
};

type Chapter = {
  chapterNumber: number;
  subtitles: Subtitle[];
  verses: Verse[];
};

type TextProps = {
  text: Chapter;
  bookName: string;
  testament?: TestamentEnum;
  bookId?: number;
};

export const Text = ({ text, bookName, testament, bookId }: TextProps) => {
  const searchParams = useGetSearchParams();

  const shareUrl = useMemo(
    () =>
      generateShareableUrl({
        bookId: bookId?.toString(),
        verseId: searchParams.verseId.toString(),
        testament: testament,
        explanationType: searchParams.explanationType,
        bibleVersion: searchParams.bibleVersion,
      }),
    [
      bookId,
      searchParams.verseId,
      testament,
      searchParams.explanationType,
      searchParams.bibleVersion,
    ],
  );

  return (
    <section className={styles.contentBox}>
      <div className={styles.titleContainer}>
        <h1 className={styles.title}>
          {bookName} {text.chapterNumber}
        </h1>
        <div className={styles.actionButtons}>
          {bookId && testament && (
            <BookmarkButton
              bookId={bookId}
              chapterNumber={text.chapterNumber}
              bookName={bookName}
              testament={testament}
              className={styles.bookmarkButton}
            />
          )}
          <CopyLinkButton
            className={styles.copyLinkButton}
            url={shareUrl}
            variant="icon"
          />
          <ShareButton
            url={shareUrl}
            title={`${bookName} ${text.chapterNumber}`}
            text={`Read ${bookName} chapter ${text.chapterNumber} on VerseMate`}
            variant="icon"
          />
        </div>
      </div>

      {text.subtitles.map((subtitle) => (
        <div key={subtitle.subtitle} className={styles.textBox}>
          <div className={styles.subtitleBox}>
            <h2 className={styles.subtitle}>{subtitle.subtitle}</h2>
            <p className={styles.description}>
              ({bookName} {text.chapterNumber}:{subtitle.start_verse} -{" "}
              {subtitle.end_verse})
            </p>
          </div>
          <div className={styles.versesContainer}>
            {text.verses
              .filter(
                (verse) =>
                  verse.verseNumber >= subtitle.start_verse &&
                  verse.verseNumber <= subtitle.end_verse,
              )
              .map((verse) => (
                <span key={verse.verseNumber} className={styles.verse}>
                  <sup className={styles.verseNumber}>{verse.verseNumber}</sup>
                  <span className={styles.verseText}>{verse.text}</span>
                </span>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
};
