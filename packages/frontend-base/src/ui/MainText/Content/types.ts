import type { Chapter, Verse } from "./Text/types";

export type Genre = {
  g: number | null;
  n: string | null;
};

export type BookVerse = {
  bookId: number;
  name: string;
  testament: "OT" | "NT";
  genre: Genre;
  chapters: Chapter[];
};

export interface ContentProps {
  bookId: string | null;
  verseId: string | null;
  book: BookVerse;
}

// Re-export commonly used types from Text
export type { Chapter, Verse };
