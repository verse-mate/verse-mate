type Genre = {
  g: number;
  n: string;
};

type Testament = "OT" | "NT";

type Verse = {
  verseId: number;
  text: string;
};

type Chapter = {
  chapterId: number;
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
