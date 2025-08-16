export type Genre = {
  g: number;
  n: string;
};

export type Testament = "OT" | "NT";

export type Verse = {
  verseId: number;
  text: string;
};

export type Subtitle = {
  subtitle: string;
  start_verse: number;
  end_verse: number;
};

export type Chapter = {
  chapterId: number;
  subtitles: Subtitle[];
  verses: Verse[];
};

export type Book = {
  bookId: number;
  name: string;
  testament: Testament;
  genre: Genre;
  chapters: Chapter[];
};

export type Bible = { books: Book[] };

export type BookMeta = {
  bookId: number;
  name: string;
  testament: Testament;
  genre: Genre;
  chaptersCount: number;
};
