import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { BookmarkButton } from "../../../Bookmarks";
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
  return (
    <section className={styles.contentBox}>
      <div className={styles.titleContainer}>
        <h1 className={styles.title}>
          {bookName} {text.chapterNumber}
        </h1>
        {bookId && testament && (
          <BookmarkButton
            bookId={bookId}
            chapterNumber={text.chapterNumber}
            bookName={bookName}
            testament={testament}
            className={styles.bookmarkButton}
          />
        )}
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
