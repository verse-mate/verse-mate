type Verse = string;

interface Book {
  bookId: string;
  name: string;
  verses: Verse[];
}

export interface Testament {
  key: string;
  value: string;
  books: Book[];
}

interface BookData {
  b: number;
  c: number;
  n: string;
  t: string;
}

export interface ResponseData {
  keys: BookData[] | [];
}

export type BookResponseType = {
  testaments: ResponseData;
  books: Book[];
  book: Book;
  explanation: string;
};
