import { useMemo } from "react";
import type { ResponseData, Testament } from "./types";

export const useTestaments = (data: ResponseData) => {
  return useMemo(() => {
    if (!data) return [];

    const oldTestamentBooks = data.keys
      .filter((book) => book.t === "OT")
      .map((book) => ({
        bookId: String(book.b),
        name: book.n.toLowerCase(),
        verses: Array.from({ length: book.c }, (_, index) =>
          (index + 1).toString(),
        ),
      }));

    const newTestamentBooks = data.keys
      .filter((book) => book.t === "NT")
      .map((book) => ({
        bookId: String(book.b),
        name: book.n.toLowerCase(),
        verses: Array.from({ length: book.c }, (_, index) =>
          (index + 1).toString(),
        ),
      }));

    const testaments: Testament[] = [
      {
        key: "oldTestament",
        value: "Old Testament",
        books: oldTestamentBooks,
      },
      {
        key: "newTestament",
        value: "New Testament",
        books: newTestamentBooks,
      },
    ];

    return testaments;
  }, [data]);
};
