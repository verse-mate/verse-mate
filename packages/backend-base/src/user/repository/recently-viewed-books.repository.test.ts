import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import shared from "../../shared/shared.plugin";
import { RecentlyViewedBooksRepository } from "./recently-viewed-books.repository";

describe("RecentlyViewedBooksRepository", () => {
  let repository: RecentlyViewedBooksRepository;
  let testUserId: string;
  const db = shared.store.db;

  beforeAll(async () => {
    repository = new RecentlyViewedBooksRepository(db);

    // Create a test user
    const user = await db
      .getOrCreateConnection()
      .insertInto("user")
      .values({
        email: faker.internet.email().toLowerCase(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        password: faker.internet.password(),
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up test data
    await db
      .getOrCreateConnection()
      .deleteFrom("user_recently_viewed_books")
      .where("user_id", "=", testUserId)
      .execute();

    await db
      .getOrCreateConnection()
      .deleteFrom("user")
      .where("id", "=", testUserId)
      .execute();

    db.closeConnection();
    shared.store.cache.disconnect();
  });

  it("should return empty array when user has no recently viewed books", async () => {
    const books = await repository.getRecentlyViewedBooks(testUserId);
    expect(books).toEqual([]);
  });

  it("should upsert a recently viewed book", async () => {
    const book = await repository.upsertRecentlyViewedBook(testUserId, 1);

    expect(book).toBeDefined();
    expect(book?.user_id).toBe(testUserId);
    expect(book?.book_id).toBe(1);
    expect(book?.last_viewed_at).toBeInstanceOf(Date);
  });

  it("should update timestamp when upserting existing book", async () => {
    // First upsert
    const firstBook = await repository.upsertRecentlyViewedBook(testUserId, 2);
    const firstTimestamp = firstBook?.last_viewed_at;

    // Wait a bit to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second upsert of same book
    const secondBook = await repository.upsertRecentlyViewedBook(testUserId, 2);
    const secondTimestamp = secondBook?.last_viewed_at;

    expect(secondTimestamp).toBeDefined();
    expect(firstTimestamp).toBeDefined();
    if (secondTimestamp && firstTimestamp) {
      expect(secondTimestamp.getTime()).toBeGreaterThan(
        firstTimestamp.getTime(),
      );
    }
  });

  it("should get recently viewed books in order of most recent", async () => {
    // Upsert books with different timestamps
    await repository.upsertRecentlyViewedBook(testUserId, 10);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await repository.upsertRecentlyViewedBook(testUserId, 11);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await repository.upsertRecentlyViewedBook(testUserId, 12);

    const books = await repository.getRecentlyViewedBooks(testUserId, 10);

    expect(books.length).toBeGreaterThanOrEqual(3);
    // Most recent should be first
    expect(books[0].book_id).toBe(12);
    expect(books[1].book_id).toBe(11);
    expect(books[2].book_id).toBe(10);
  });

  it("should limit results to specified limit", async () => {
    const books = await repository.getRecentlyViewedBooks(testUserId, 2);
    expect(books.length).toBeLessThanOrEqual(2);
  });

  it("should bulk upsert multiple books", async () => {
    const now = new Date();
    const booksToUpsert = [
      { bookId: 20, timestamp: new Date(now.getTime() - 1000) },
      { bookId: 21, timestamp: new Date(now.getTime() - 2000) },
      { bookId: 22, timestamp: new Date(now.getTime() - 3000) },
    ];

    const result = await repository.bulkUpsertRecentlyViewedBooks(
      testUserId,
      booksToUpsert,
    );

    expect(result).toHaveLength(3);
    expect(result.map((b) => b.book_id)).toContain(20);
    expect(result.map((b) => b.book_id)).toContain(21);
    expect(result.map((b) => b.book_id)).toContain(22);
  });

  it("should handle empty array in bulk upsert", async () => {
    const result = await repository.bulkUpsertRecentlyViewedBooks(
      testUserId,
      [],
    );
    expect(result).toEqual([]);
  });

  it("should keep most recent timestamp when bulk upserting existing books", async () => {
    const oldTimestamp = new Date(Date.now() - 10000);
    const newTimestamp = new Date();

    // First bulk upsert with old timestamp
    await repository.bulkUpsertRecentlyViewedBooks(testUserId, [
      { bookId: 30, timestamp: oldTimestamp },
    ]);

    // Get the book to verify old timestamp
    let books = await repository.getRecentlyViewedBooks(testUserId, 100);
    const oldBook = books.find((b) => b.book_id === 30);
    expect(oldBook).toBeDefined();

    // Second bulk upsert with newer timestamp
    await repository.bulkUpsertRecentlyViewedBooks(testUserId, [
      { bookId: 30, timestamp: newTimestamp },
    ]);

    // Get the book again
    books = await repository.getRecentlyViewedBooks(testUserId, 100);
    const newBook = books.find((b) => b.book_id === 30);

    expect(newBook).toBeDefined();
    if (newBook && oldBook) {
      expect(new Date(newBook.last_viewed_at).getTime()).toBeGreaterThan(
        new Date(oldBook.last_viewed_at).getTime(),
      );
    }
  });

  it("should not overwrite newer timestamp with older one in bulk upsert", async () => {
    const newerTimestamp = new Date();
    const olderTimestamp = new Date(Date.now() - 10000);

    // First upsert with newer timestamp
    await repository.bulkUpsertRecentlyViewedBooks(testUserId, [
      { bookId: 40, timestamp: newerTimestamp },
    ]);

    const booksAfterFirst = await repository.getRecentlyViewedBooks(
      testUserId,
      100,
    );
    const firstBook = booksAfterFirst.find((b) => b.book_id === 40);
    const firstTimestamp = firstBook?.last_viewed_at;

    // Try to upsert with older timestamp
    await repository.bulkUpsertRecentlyViewedBooks(testUserId, [
      { bookId: 40, timestamp: olderTimestamp },
    ]);

    const booksAfterSecond = await repository.getRecentlyViewedBooks(
      testUserId,
      100,
    );
    const secondBook = booksAfterSecond.find((b) => b.book_id === 40);
    const secondTimestamp = secondBook?.last_viewed_at;

    // Timestamp should remain the same (newer one)
    expect(firstTimestamp).toBeDefined();
    expect(secondTimestamp).toBeDefined();
    if (firstTimestamp && secondTimestamp) {
      expect(new Date(secondTimestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(firstTimestamp).getTime(),
      );
    }
  });

  it("should handle multiple users independently", async () => {
    // Create second test user
    const user2 = await db
      .getOrCreateConnection()
      .insertInto("user")
      .values({
        email: faker.internet.email().toLowerCase(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        password: faker.internet.password(),
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const testUserId2 = user2.id;

    // Add books for both users
    await repository.upsertRecentlyViewedBook(testUserId, 50);
    await repository.upsertRecentlyViewedBook(testUserId2, 51);

    // Get books for each user
    const user1Books = await repository.getRecentlyViewedBooks(testUserId, 10);
    const user2Books = await repository.getRecentlyViewedBooks(testUserId2, 10);

    // User 1 should have book 50
    expect(user1Books.some((b) => b.book_id === 50)).toBe(true);
    expect(user1Books.some((b) => b.book_id === 51)).toBe(false);

    // User 2 should have book 51
    expect(user2Books.some((b) => b.book_id === 51)).toBe(true);
    expect(user2Books.some((b) => b.book_id === 50)).toBe(false);

    // Clean up second user
    await db
      .getOrCreateConnection()
      .deleteFrom("user_recently_viewed_books")
      .where("user_id", "=", testUserId2)
      .execute();

    await db
      .getOrCreateConnection()
      .deleteFrom("user")
      .where("id", "=", testUserId2)
      .execute();
  });
});
