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

  // Generate user data
  const authSignupInput = {
    email: email || faker.internet.email().toLocaleLowerCase(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    password: faker.internet.password(),
  };

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
