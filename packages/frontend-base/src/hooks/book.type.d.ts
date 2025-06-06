export interface BookResponseType {
  book: Book;
}

export interface Book {
  bookId: number;
  name: string;
  testament: string;
  genre: Genre;
  chapters: Chapter[];
}

export interface Genre {
  g: number;
  n: string;
}

export interface Chapter {
  chapterId: number;
  verses: Verse[];
}

export interface Verse {
  verseId: number;
  text: string;
}
