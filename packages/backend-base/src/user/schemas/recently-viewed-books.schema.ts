import { t } from "elysia";

export const RecentlyViewedBooksSchema = t.Object({
  bookIds: t.Array(t.String(), {
    description: "Array of book IDs in order of most recently viewed",
  }),
});

export const SyncRecentlyViewedBooksRequestSchema = t.Object({
  books: t.Array(
    t.Object({
      bookId: t.String({
        description: "Book ID",
      }),
      timestamp: t.Number({
        description: "Unix timestamp (milliseconds) when the book was viewed",
      }),
    }),
    {
      description: "Array of recently viewed books from localStorage",
    },
  ),
});
