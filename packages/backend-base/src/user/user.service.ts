import type { db } from "../shared/shared.plugin";
import type { User } from "./entities/user.entity";
import { RecentlyViewedBooksRepository } from "./repository/recently-viewed-books.repository";

export class UserService {
  private recentlyViewedBooksRepository: RecentlyViewedBooksRepository;

  constructor(private readonly db: db) {
    this.recentlyViewedBooksRepository = new RecentlyViewedBooksRepository(db);
  }

  async findOne(userId: string): Promise<User> {
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", userId)
      .selectAll()
      .executeTakeFirstOrThrow();

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      emailVerified: user.emailVerified,
    };
  }

  // TODO: pagination
  async findAll(): Promise<User[]> {
    const users = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .selectAll()
      .orderBy("firstName asc")
      .execute();

    return await Promise.all(
      users.map(async ({ id, email, firstName, lastName }) => ({
        id,
        email,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
      })),
    );
  }

  /**
   * Get recently viewed books for a user
   */
  async getRecentlyViewedBooks(userId: string): Promise<string[]> {
    const books =
      await this.recentlyViewedBooksRepository.getRecentlyViewedBooks(
        userId,
        4,
      );
    return books.map((book) => book.book_id.toString());
  }

  /**
   * Sync recently viewed books from localStorage with database
   * Merges local and DB data, keeping the most recent timestamps
   */
  async syncRecentlyViewedBooks(
    userId: string,
    localBooks: Array<{ bookId: string; timestamp: number }>,
  ): Promise<string[]> {
    // Convert local books to the format expected by repository
    const localBooksForDb = localBooks.map((book) => ({
      bookId: Number.parseInt(book.bookId, 10),
      timestamp: new Date(book.timestamp),
    }));

    // Get current books from DB
    const dbBooks =
      await this.recentlyViewedBooksRepository.getRecentlyViewedBooks(
        userId,
        100,
      ); // Get all to merge properly

    // Create a map to track the most recent timestamp for each book
    const bookMap = new Map<number, Date>();

    // Add DB books to map
    for (const book of dbBooks) {
      bookMap.set(book.book_id, new Date(book.last_viewed_at));
    }

    // Merge with local books, keeping most recent timestamp
    for (const book of localBooksForDb) {
      const existingTimestamp = bookMap.get(book.bookId);
      if (!existingTimestamp || book.timestamp > existingTimestamp) {
        bookMap.set(book.bookId, book.timestamp);
      }
    }

    // Convert map back to array format
    const mergedBooks = Array.from(bookMap.entries()).map(
      ([bookId, timestamp]) => ({
        bookId,
        timestamp,
      }),
    );

    // Bulk upsert all merged books
    if (mergedBooks.length > 0) {
      await this.recentlyViewedBooksRepository.bulkUpsertRecentlyViewedBooks(
        userId,
        mergedBooks,
      );
    }

    // Get the final top 4 books from DB
    const finalBooks =
      await this.recentlyViewedBooksRepository.getRecentlyViewedBooks(
        userId,
        4,
      );

    return finalBooks.map((book) => book.book_id.toString());
  }
}
