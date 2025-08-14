import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { MainText } from "../index";
import styles from "./content.module.css";

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

type Genre = {
  g: number | null;
  n: string | null;
};

type BookVerse = {
  bookId: number;
  name: string;
  testament: TestamentEnum;
  genre: Genre;
  chapters: Chapter[];
};

type ContentProps = {
  bookId: string | null;
  verseId: string | null;
  book: BookVerse;
};

export const Content = ({ bookId, verseId, book }: ContentProps) => {
  if (!bookId || !verseId || !book) {
    return <div>Verse not found</div>;
  }

  return (
    <section className={styles.content}>
      {book.chapters?.map((chapter) => (
        <div key={chapter.chapterNumber}>
          <MainText.Text
            text={chapter}
            bookName={book.name}
            testament={book.testament}
            bookId={Number(bookId)}
          />
        </div>
      ))}
    </section>
  );
};
