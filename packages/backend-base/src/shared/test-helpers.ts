import { spyOn } from "bun:test";
import { faker } from "@faker-js/faker";
import authPlugin from "../auth/auth.plugin";
import biblePlugin from "../bible/bible.plugin";
import { getTestClient } from "./test-client";

/**
 * Test helper to create authenticated users with optional admin role
 */
export async function createTestUser(options?: {
  isAdmin?: boolean;
  email?: string;
}) {
  const { isAdmin = false, email } = options || {};

  // Create combined plugin for auth
  const plugin = biblePlugin.use(authPlugin);
  const testClient = getTestClient<typeof plugin>(plugin);

  // Generate user data.
  // The signup policy requires >=8 chars with at least one letter AND one
  // digit (^(?=.*\d)(?=.*[a-zA-Z]).{8,}$). faker.internet.password() can return
  // an all-letter string, which intermittently fails that validation and
  // flakes every test that creates a user. Prefix a known letter+digit and cap
  // to the 20-char max so the password is always compliant.
  const authSignupInput = {
    email: email || faker.internet.email().toLocaleLowerCase(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    password: `Aa1${faker.internet.password()}`.slice(0, 20),
  };

  // Clear rate limit cache to allow signup (other tests may have used up the limit)
  await plugin.store.cache.delete("rate-limit:signup:unknown");
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Mock email sending
  spyOn(plugin.store.notification, "sendEmail").mockImplementation(() =>
    Promise.resolve(),
  );

  // Create user via signup
  const { data } = await testClient.auth.signup.post(authSignupInput);

  if (!data?.accessToken) {
    throw new Error("Failed to create test user");
  }

  // Get user ID from database
  const user = await plugin.store.db
    .getOrCreateConnection()
    .selectFrom("user")
    .where("email", "=", authSignupInput.email)
    .selectAll()
    .executeTakeFirstOrThrow();

  // Update user to admin if requested
  if (isAdmin) {
    await plugin.store.db
      .getOrCreateConnection()
      .updateTable("user")
      .set({
        is_admin: true,
      })
      .where("id", "=", user.id)
      .executeTakeFirstOrThrow();
  }

  return {
    userId: user.id,
    email: authSignupInput.email,
    password: authSignupInput.password,
    firstName: authSignupInput.firstName,
    lastName: authSignupInput.lastName,
    accessToken: data.accessToken,
    isAdmin,
  };
}

/**
 * Helper to create multiple test users at once
 */
export async function createTestUsers(
  count: number,
  options?: {
    adminCount?: number;
  },
) {
  const { adminCount = 0 } = options || {};
  const users = [];

  for (let i = 0; i < count; i++) {
    const isAdmin = i < adminCount;
    const user = await createTestUser({ isAdmin });
    users.push(user);
  }

  return users;
}
