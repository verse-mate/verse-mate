type Genre = {
  g: number;
  n: string;
};

type Testament = "OT" | "NT";

type Verse = {
  verseId: number;
  text: string;
};

type Subtitle = {
  subtitle: string;
  start_verse: number;
  end_verse: number;
};

type Chapter = {
  chapterId: number;
  subtitles: Subtitle[];
  verses: Verse[];
};

type Book = {
  bookId: number;
  name: string;
  testament: Testament;
  genre: Genre;
  chapters: Chapter[];
};

type Bible = { books: Book[] };

type BookMeta = {
  bookId: number;
  name: string;
  testament: Testament;
  genre: Genre;
  chaptersCount: number;
};
