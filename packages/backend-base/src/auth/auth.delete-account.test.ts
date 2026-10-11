import { beforeAll, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";

import cacheConstants from "../shared/cache.constants";
import { getTestClient } from "../shared/test-client";
import Backend, { type AuthPlugin } from "./auth.plugin";
import type { AuthPayload } from "./entities/auth.entity";

describe("Auth - Delete Account", () => {
  const client = getTestClient<AuthPlugin>(Backend);
  const cacheService = Backend.store.cache;
  const db = Backend.store.db.getOrCreateConnection();

  const signUp = async (input: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => {
    await cacheService.delete("rate-limit:signup:unknown");
    return client.auth.signup.post(input);
  };

  let emailPasswordUser: {
    email: string;
    password: string;
    authPayload: AuthPayload;
    userId: string;
  };

  beforeAll(async () => {
    // Create an email/password user for testing
    const emailPasswordSignup = {
      email: faker.internet.email().toLowerCase(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      password: "TestPassword123", // Must have letters and numbers
    };

    spyOn(Backend.store.notification, "sendEmail").mockImplementation(() =>
      Promise.resolve({ delivered: true }),
    );

    const { data: signupData, error: signupError } =
      await signUp(emailPasswordSignup);
    if (signupError) throw signupError;
    if (!signupData) throw new Error("Signup failed");

    const { data: userData } = await client.auth.user.get({
      headers: {
        authorization: `Bearer ${signupData.accessToken}`,
      },
    });
    if (!userData?.id) throw new Error("Failed to get user ID");

    emailPasswordUser = {
      email: emailPasswordSignup.email,
      password: emailPasswordSignup.password,
      authPayload: signupData,
      userId: userData.id,
    };

    // Note: We skip adding test data here because it requires knowing valid IDs
    // from the database. The deletion tests focus on the API endpoint functionality
    // rather than verifying specific data cleanup.
  });

  it("should delete email/password account with correct password", async () => {
    // Create a fresh user for this test
    const testUser = {
      email: faker.internet.email().toLowerCase(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      password: "TestDelete123",
    };

    spyOn(Backend.store.notification, "sendEmail").mockImplementation(() =>
      Promise.resolve({ delivered: true }),
    );

    const { data: signupData } = await signUp(testUser);
    if (!signupData) throw new Error("Signup failed");

    const { data: userData } = await client.auth.user.get({
      headers: {
        authorization: `Bearer ${signupData.accessToken}`,
      },
    });
    if (!userData?.id) throw new Error("Failed to get user ID");

    // Test data insertion skipped - focus is on testing the deletion endpoint

    // Delete the account
    const { data: deleteData, error: deleteError } =
      await client.auth.account.delete(
        { password: testUser.password },
        {
          headers: {
            authorization: `Bearer ${signupData.accessToken}`,
          },
        },
      );

    expect(deleteError).toBeFalsy();
    expect(deleteData?.success).toBe(true);
    expect(deleteData?.message).toBe("Account successfully deleted");

    // Verify user is deleted from database
    const deletedUser = await db
      .selectFrom("user")
      .where("id", "=", userData.id)
      .selectAll()
      .executeTakeFirst();
    expect(deletedUser).toBeUndefined();

    // Verify Redis tokens are cleared
    const cachedTokens = await cacheService.get<string[]>(
      cacheConstants.accessToken(userData.id),
    );
    expect(cachedTokens).toBeFalsy();
  });

  it("should fail to delete account with incorrect password", async () => {
    const { data, error } = await client.auth.account.delete(
      { password: "wrongpassword" },
      {
        headers: {
          authorization: `Bearer ${emailPasswordUser.authPayload.accessToken}`,
        },
      },
    );

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect((error as any)?.status).toBe(401);
    expect((error as any)?.value?.error).toBe("UNAUTHORIZED");

    // Verify user still exists
    const user = await db
      .selectFrom("user")
      .where("id", "=", emailPasswordUser.userId)
      .selectAll()
      .executeTakeFirst();
    expect(user).toBeDefined();
  });

  it("should fail to delete account without password when required", async () => {
    const { data, error } = await client.auth.account.delete(
      {}, // No password provided
      {
        headers: {
          authorization: `Bearer ${emailPasswordUser.authPayload.accessToken}`,
        },
      },
    );

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect((error as any)?.status).toBe(400);
    expect((error as any)?.value?.error).toBe("PASSWORD_REQUIRED");
    expect((error as any)?.value?.message).toContain(
      "Password is required to delete your account",
    );

    // Verify user still exists
    const user = await db
      .selectFrom("user")
      .where("id", "=", emailPasswordUser.userId)
      .selectAll()
      .executeTakeFirst();
    expect(user).toBeDefined();
  });

  it.skip("should delete SSO-only account without password", async () => {
    // Create a fresh SSO user for this test (manually to avoid SSO flow complexity)
    const ssoEmail = faker.internet.email().toLowerCase();
    const ssoUser = await db
      .insertInto("user")
      .values({
        email: ssoEmail,
        password: null, // SSO-only user
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        emailVerified: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create SSO link
    await db
      .insertInto("user_sso_accounts")
      .values({
        user_id: ssoUser.id,
        provider: "google" as any, // Type assertion for test
        provider_user_id: faker.string.uuid(),
        email: ssoEmail,
      })
      .execute();

    // Create auth tokens using loginWithSSO which handles SSO users properly
    const authService = Backend.store.authService;

    // Use loginUser directly (since we already have the user)
    const _ssoAuthPayload = await (authService as any).loginUser(
      ssoUser,
      Backend.store.db.getOrCreateConnection().selectFrom,
    );

    // Manually create tokens for testing
    const { default: authPlugin } = await import("./auth.plugin");
    const app = authPlugin;
    const jwt = (app as any)._types.Singleton.decorator.jwt;
    if (!jwt) {
      // Fallback: create token string manually
      // This is a test-only workaround
      throw new Error("JWT not available in test");
    }

    const accessToken = await jwt.sign({ sub: ssoUser.id });
    await cacheService.set(
      cacheConstants.accessToken(ssoUser.id),
      [accessToken],
      "15m",
    );

    // Delete the account without password
    const { data: deleteData, error: deleteError } =
      await client.auth.account.delete(
        {}, // No password needed for SSO accounts
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

    expect(deleteError).toBeFalsy();
    expect(deleteData?.success).toBe(true);

    // Verify user is deleted
    const deletedUser = await db
      .selectFrom("user")
      .where("id", "=", ssoUser.id)
      .selectAll()
      .executeTakeFirst();
    expect(deletedUser).toBeUndefined();

    // Verify SSO account link is deleted
    const ssoAccount = await db
      .selectFrom("user_sso_accounts")
      .where("user_id", "=", ssoUser.id)
      .selectAll()
      .execute();
    expect(ssoAccount).toHaveLength(0);
  });

  const signUpAnother = async () => {
    const testUser = {
      email: faker.internet.email().toLowerCase(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      password: "TestComprehensive123",
    };
    const { data: signupData, error } = await signUp(testUser);
    if (error || !signupData) throw error ?? new Error("Signup failed");
    const { data: userData } = await client.auth.user.get({
      headers: { authorization: `Bearer ${signupData.accessToken}` },
    });
    if (!userData?.id) throw new Error("Failed to get user ID");
    return {
      id: userData.id,
      password: testUser.password,
      accessToken: signupData.accessToken,
    };
  };

  const deleteAccount = (user: { password: string; accessToken: string }) =>
    client.auth.account.delete(
      { password: user.password },
      { headers: { authorization: `Bearer ${user.accessToken}` } },
    );

  it("should delete all user-related data from all tables", async () => {
    const user = await signUpAnother();
    const chapter = await db
      .selectFrom("chapters")
      .select(["chapter_id", "book_id", "chapter_number"])
      .orderBy("chapter_id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("user_sso_accounts")
      .values({
        user_id: user.id,
        provider: "google" as any,
        provider_user_id: faker.string.uuid(),
        email: faker.internet.email().toLowerCase(),
      })
      .execute();
    await db
      .insertInto("notes")
      .values({
        user_id: user.id,
        chapter_id: chapter.chapter_id,
        content: faker.lorem.sentence(),
      })
      .execute();
    await db
      .insertInto("favorites")
      .values({
        user_id: user.id,
        chapter_id: chapter.chapter_id,
        type: "chapter" as any,
      })
      .execute();
    await db
      .insertInto("verse_highlights")
      .values({
        user_id: user.id,
        chapter_id: chapter.chapter_id,
        book_id: chapter.book_id,
        chapter_number: chapter.chapter_number,
        start_verse: 1,
        end_verse: 2,
      })
      .execute();
    await db
      .insertInto("user_progress")
      .values({
        user_id: user.id,
        book_id: chapter.book_id,
        chapter_id: chapter.chapter_id,
      })
      .execute();
    await db
      .insertInto("user_recently_viewed_books")
      .values({ user_id: user.id, book_id: chapter.book_id })
      .execute();
    await db
      .insertInto("device_tokens")
      .values({
        user_id: user.id,
        token: faker.string.alphanumeric(32),
        platform: "ios",
      })
      .execute();

    const { error: deleteError } = await deleteAccount(user);

    expect(deleteError).toBeFalsy();
    expect(
      await db
        .selectFrom("user")
        .select("id")
        .where("id", "=", user.id)
        .executeTakeFirst(),
    ).toBeUndefined();
    for (const table of [
      "user_sso_accounts",
      "notes",
      "favorites",
      "verse_highlights",
      "user_progress",
      "user_recently_viewed_books",
      "device_tokens",
    ] as const) {
      const left = await db
        .selectFrom(table)
        .select("user_id")
        .where("user_id", "=", user.id)
        .execute();
      expect({ table, left: left.length }).toEqual({ table, left: 0 });
    }
    expect(
      await cacheService.get<string[]>(cacheConstants.accessToken(user.id)),
    ).toBeFalsy();
  });

  it("deletes an account that created a batch job and keeps the job without its creator", async () => {
    const user = await signUpAnother();
    const job = await db
      .insertInto("batch_jobs")
      .values({
        batch_type: "explanation",
        bible_version: "NASB1995",
        model: "gpt-4",
        explanation_types: [],
        created_by: user.id,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    try {
      const { data, error } = await deleteAccount(user);

      expect(error).toBeFalsy();
      expect(data?.success).toBe(true);
      expect(
        await db
          .selectFrom("user")
          .select("id")
          .where("id", "=", user.id)
          .executeTakeFirst(),
      ).toBeUndefined();
      const kept = await db
        .selectFrom("batch_jobs")
        .select(["id", "created_by"])
        .where("id", "=", job.id)
        .executeTakeFirst();
      expect(kept).toEqual({ id: job.id, created_by: null } as any);
    } finally {
      await db.deleteFrom("batch_jobs").where("id", "=", job.id).execute();
    }
  });

  it("should require authentication to delete account", async () => {
    const { data, error } = await client.auth.account.delete({
      password: "somepassword",
    });

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect((error as any)?.status).toBe(401);
  });

  it("should rate limit deletion attempts - 3 per hour", async () => {
    // Create a fresh user for rate limiting test
    const testUser = {
      email: faker.internet.email().toLowerCase(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      password: "TestRateLimit123",
    };

    spyOn(Backend.store.notification, "sendEmail").mockImplementation(() =>
      Promise.resolve({ delivered: true }),
    );

    const { data: signupData } = await signUp(testUser);
    if (!signupData) throw new Error("Signup failed");

    const { data: userData } = await client.auth.user.get({
      headers: {
        authorization: `Bearer ${signupData.accessToken}`,
      },
    });
    if (!userData?.id) throw new Error("Failed to get user ID");

    // Clear any existing rate limit
    await cacheService.delete(`rate-limit:delete-account:${userData.id}`);

    // Make 3 failed deletion attempts (wrong password)
    for (let i = 0; i < 3; i++) {
      const { error } = await client.auth.account.delete(
        { password: "wrongpassword" },
        {
          headers: {
            authorization: `Bearer ${signupData.accessToken}`,
          },
        },
      );
      expect(error).toBeTruthy();
      expect((error as any)?.status).toBe(401); // UNAUTHORIZED, not rate limited
    }

    // 4th attempt should hit rate limit
    const { data, error } = await client.auth.account.delete(
      { password: "wrongpassword" },
      {
        headers: {
          authorization: `Bearer ${signupData.accessToken}`,
        },
      },
    );

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect((error as any)?.status).toBe(429);
    expect((error as any)?.value?.error).toBe("TOO_MANY_REQUESTS");
    expect((error as any)?.value?.message).toBe(
      "Too many deletion attempts, please try again later",
    );
    expect((error as any)?.value?.retryAfter).toBeDefined();
    expect((error as any)?.value?.retryAfter).toBeGreaterThan(0);
    expect((error as any)?.value?.retryAfter).toBeLessThanOrEqual(3600);

    // Clean up
    await cacheService.delete(`rate-limit:delete-account:${userData.id}`);
  });
});
