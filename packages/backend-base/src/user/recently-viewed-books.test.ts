import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";

import authPlugin from "../auth/auth.plugin";
import { getTestClient } from "../shared/test-client";
import Backend from "./user.plugin";

describe("Recently Viewed Books", () => {
  let accessToken: string;
  const authSignupInput = {
    email: faker.internet.email().toLocaleLowerCase(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    password: faker.internet.password(),
  };
  const plugin = Backend.use(authPlugin);
  // @ts-ignore - TODO: Fix this
  const testClient = getTestClient<typeof plugin>(plugin);

  beforeAll(async () => {
    // Clear rate limit cache to allow signup (auth tests may have used up the limit)
    await Backend.store.cache.delete("rate-limit:signup:unknown");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const { data, error } = await testClient.auth.signup.post(authSignupInput);
    if (error) throw error;

    accessToken = data?.accessToken ?? "";
  });

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  it("should return empty array for new user with no recently viewed books", async () => {
    const { data } = await testClient.user["recently-viewed-books"].get({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (data instanceof Error) throw data;

    expect(data?.bookIds).toEqual([]);
  });

  it("should sync single book from localStorage", async () => {
    const book1 = { bookId: "1", timestamp: Date.now() };

    const { data } = await testClient.user["recently-viewed-books"].sync.post(
      {
        books: [book1],
      },
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (data instanceof Error) throw data;

    expect(data?.bookIds).toEqual(["1"]);
  });

  it("should sync multiple books from localStorage", async () => {
    const now = Date.now();
    const books = [
      { bookId: "1", timestamp: now },
      { bookId: "2", timestamp: now - 1000 },
      { bookId: "3", timestamp: now - 2000 },
    ];

    const { data } = await testClient.user["recently-viewed-books"].sync.post(
      {
        books,
      },
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (data instanceof Error) throw data;

    // Should return books in order of most recent
    expect(data?.bookIds).toEqual(["1", "2", "3"]);
  });

  it("should limit to 4 most recent books", async () => {
    const now = Date.now();
    const books = [
      { bookId: "1", timestamp: now },
      { bookId: "2", timestamp: now - 1000 },
      { bookId: "3", timestamp: now - 2000 },
      { bookId: "4", timestamp: now - 3000 },
      { bookId: "5", timestamp: now - 4000 }, // This should be excluded
    ];

    const { data } = await testClient.user["recently-viewed-books"].sync.post(
      {
        books,
      },
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (data instanceof Error) throw data;

    expect(data?.bookIds).toHaveLength(4);
    expect(data?.bookIds).toEqual(["1", "2", "3", "4"]);
    expect(data?.bookIds).not.toContain("5");
  });

  it("should update timestamp when same book is viewed again", async () => {
    const oldTimestamp = Date.now() - 10000;
    const newTimestamp = Date.now();

    // First sync with old timestamp
    await testClient.user["recently-viewed-books"].sync.post(
      {
        books: [
          { bookId: "10", timestamp: oldTimestamp },
          { bookId: "11", timestamp: oldTimestamp - 1000 },
        ],
      },
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    // Sync again with book 11 having newer timestamp
    const { data } = await testClient.user["recently-viewed-books"].sync.post(
      {
        books: [{ bookId: "11", timestamp: newTimestamp }],
      },
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (data instanceof Error) throw data;

    // Book 11 should now be first (most recent)
    expect(data?.bookIds[0]).toBe("11");
  });

  it("should merge localStorage and DB data correctly", async () => {
    // Clear previous data by syncing with fresh books
    const baseTimestamp = Date.now();

    // First sync - books in DB
    await testClient.user["recently-viewed-books"].sync.post(
      {
        books: [
          { bookId: "20", timestamp: baseTimestamp - 3000 },
          { bookId: "21", timestamp: baseTimestamp - 4000 },
        ],
      },
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    // Second sync - new books from localStorage
    const { data } = await testClient.user["recently-viewed-books"].sync.post(
      {
        books: [
          { bookId: "22", timestamp: baseTimestamp },
          { bookId: "23", timestamp: baseTimestamp - 1000 },
        ],
      },
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (data instanceof Error) throw data;

    // Should return top 4 books
    expect(data?.bookIds).toHaveLength(4);
    // Most recent should be book 22
    expect(data?.bookIds[0]).toBe("22");
    // Should contain all the books we synced in this test
    expect(data?.bookIds).toContain("22");
    expect(data?.bookIds).toContain("23");
    // May also contain books from previous tests since we're sharing state
  });

  it("should keep most recent timestamp when merging duplicates", async () => {
    const oldTimestamp = Date.now() - 10000;
    const newTimestamp = Date.now();

    // First sync - book 30 with old timestamp
    await testClient.user["recently-viewed-books"].sync.post(
      {
        books: [
          { bookId: "30", timestamp: oldTimestamp },
          { bookId: "31", timestamp: oldTimestamp - 1000 },
        ],
      },
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    // Second sync - book 30 with newer timestamp
    const { data } = await testClient.user["recently-viewed-books"].sync.post(
      {
        books: [{ bookId: "30", timestamp: newTimestamp }],
      },
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (data instanceof Error) throw data;

    // Book 30 should be first due to newer timestamp
    expect(data?.bookIds[0]).toBe("30");
  });

  it("should handle empty sync request", async () => {
    const { data } = await testClient.user["recently-viewed-books"].sync.post(
      {
        books: [],
      },
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (data instanceof Error) throw data;

    // Should return existing books (from previous tests)
    expect(Array.isArray(data?.bookIds)).toBe(true);
  });

  it("should require authentication for getting recently viewed books", async () => {
    const { error, status } =
      await testClient.user["recently-viewed-books"].get();

    expect(status).toBe(401);
    expect(error).toBeDefined();
  });

  it("should require authentication for syncing recently viewed books", async () => {
    const { error, status } = await testClient.user[
      "recently-viewed-books"
    ].sync.post({
      books: [{ bookId: "1", timestamp: Date.now() }],
    });

    expect(status).toBe(401);
    expect(error).toBeDefined();
  });

  it("should get recently viewed books after syncing", async () => {
    // Clear rate limit cache and mock email for this fresh signup
    await Backend.store.cache.delete("rate-limit:signup:unknown");
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Mock email sending for this signup
    spyOn(Backend.store.notification, "sendEmail").mockImplementation(() =>
      Promise.resolve({ delivered: true }),
    );

    // Create a fresh user for this test to avoid state pollution from previous tests
    const freshUserSignup = {
      email: faker.internet.email().toLocaleLowerCase(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      password: faker.internet.password(),
    };
    const { data: signupData, error: signupError } =
      await testClient.auth.signup.post(freshUserSignup);
    if (signupError) throw signupError;

    const freshAccessToken = signupData?.accessToken ?? "";

    const now = Date.now();
    const books = [
      { bookId: "40", timestamp: now },
      { bookId: "41", timestamp: now - 1000 },
    ];

    // Sync books
    await testClient.user["recently-viewed-books"].sync.post(
      {
        books,
      },
      {
        headers: {
          authorization: `Bearer ${freshAccessToken}`,
        },
      },
    );

    // Get books
    const { data } = await testClient.user["recently-viewed-books"].get({
      headers: {
        authorization: `Bearer ${freshAccessToken}`,
      },
    });

    if (data instanceof Error) throw data;

    expect(data?.bookIds).toContain("40");
    expect(data?.bookIds).toContain("41");
  });
});
