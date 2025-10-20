import type { NewUserRecentlyViewedBooks } from "database/src/models/public/UserRecentlyViewedBooks";
import type { db } from "../../shared/shared.plugin";

export class RecentlyViewedBooksRepository {
  constructor(private readonly db: db) {}

  /**
   * Get recently viewed books for a user, ordered by most recent first
   */
  async getRecentlyViewedBooks(userId: string, limit = 4) {
    const books = await this.db
      .getOrCreateConnection()
      .selectFrom("user_recently_viewed_books")
      .where("user_id", "=", userId)
      .select(["book_id", "last_viewed_at"])
      .orderBy("last_viewed_at", "desc")
      .limit(limit)
      .execute();

    return books;
  }

  /**
   * Upsert a single recently viewed book
   * If the book exists for this user, update the timestamp
   * If not, insert a new record
   */
  async upsertRecentlyViewedBook(userId: string, bookId: number) {
    const book = await this.db
      .getOrCreateConnection()
      .insertInto("user_recently_viewed_books")
      .values({
        user_id: userId,
        book_id: bookId,
        last_viewed_at: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(["user_id", "book_id"]).doUpdateSet({
          last_viewed_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirst();

    return book;
  }

  /**
   * Bulk upsert recently viewed books with their timestamps
   * Used for syncing from localStorage
   */
  async bulkUpsertRecentlyViewedBooks(
    userId: string,
    books: Array<{ bookId: number; timestamp: Date }>,
  ) {
    if (books.length === 0) {
      return [];
    }

    const values: NewUserRecentlyViewedBooks[] = books.map((book) => ({
      user_id: userId,
      book_id: book.bookId,
      last_viewed_at: book.timestamp,
    }));

    const upsertedBooks = await this.db
      .getOrCreateConnection()
      .insertInto("user_recently_viewed_books")
      .values(values)
      .onConflict((oc) =>
        oc.columns(["user_id", "book_id"]).doUpdateSet((eb) => ({
          // Only update if the new timestamp is more recent
          last_viewed_at: eb.fn("GREATEST", [
            eb.ref("user_recently_viewed_books.last_viewed_at"),
            eb.ref("excluded.last_viewed_at"),
          ]),
        })),
      )
      .returningAll()
      .execute();

    return upsertedBooks;
  }
}
