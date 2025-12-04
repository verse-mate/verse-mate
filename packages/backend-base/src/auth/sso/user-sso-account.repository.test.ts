import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";
import shared from "../../shared/shared.plugin";
import { UserSsoAccountRepository } from "./user-sso-account.repository";

describe("UserSsoAccountRepository", () => {
  let repository: UserSsoAccountRepository;
  let testUserId: string;
  let testUserId2: string;
  const db = shared.store.db;

  beforeAll(async () => {
    repository = new UserSsoAccountRepository(db);

    // Create test users - one with password (regular user) and one without (SSO-only user)
    const user1 = await db
      .getOrCreateConnection()
      .insertInto("user")
      .values({
        email: faker.internet.email().toLowerCase(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        password: faker.internet.password(), // Regular user with password
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    testUserId = user1.id;

    // Create SSO-only user with nullable password
    const user2 = await db
      .getOrCreateConnection()
      .insertInto("user")
      .values({
        email: faker.internet.email().toLowerCase(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        password: null, // SSO-only user with no password
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    testUserId2 = user2.id;
  });

  afterAll(async () => {
    // Clean up test data - SSO accounts will be deleted by CASCADE
    await db
      .getOrCreateConnection()
      .deleteFrom("user")
      .where("id", "in", [testUserId, testUserId2])
      .execute();

    db.closeConnection();
    shared.store.cache.disconnect();
  });

  it("should insert and retrieve an SSO account", async () => {
    const ssoData = {
      user_id: testUserId,
      provider: SsoProviderEnum.google,
      provider_user_id: faker.string.uuid(),
      email: faker.internet.email().toLowerCase(),
    };

    const created = await repository.create(ssoData);

    expect(created).toBeDefined();
    expect(created?.id).toBeDefined();
    expect(created?.user_id).toBe(testUserId);
    expect(created?.provider).toBe(SsoProviderEnum.google);
    expect(created?.provider_user_id).toBe(ssoData.provider_user_id);
    expect(created?.email).toBe(ssoData.email);
    expect(created?.created_at).toBeInstanceOf(Date);

    // Verify retrieval by provider and provider_user_id
    const retrieved = await repository.findByProviderAndProviderId(
      SsoProviderEnum.google,
      ssoData.provider_user_id,
    );

    expect(retrieved).toBeDefined();
    expect(created).toBeDefined();
    expect(retrieved?.id).toBe(created?.id as string);
  });

  it("should enforce unique constraint on (provider, provider_user_id)", async () => {
    const providerUserId = faker.string.uuid();
    const ssoData = {
      user_id: testUserId,
      provider: SsoProviderEnum.apple,
      provider_user_id: providerUserId,
      email: faker.internet.email().toLowerCase(),
    };

    // First insert should succeed
    const first = await repository.create(ssoData);
    expect(first).toBeDefined();

    // Second insert with same provider and provider_user_id should fail
    const duplicateData = {
      user_id: testUserId2, // Different user
      provider: SsoProviderEnum.apple, // Same provider
      provider_user_id: providerUserId, // Same provider_user_id
      email: faker.internet.email().toLowerCase(),
    };

    await expect(repository.create(duplicateData)).rejects.toThrow();
  });

  it("should delete SSO accounts when user is deleted (CASCADE)", async () => {
    // Create a temporary user
    const tempUser = await db
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

    // Create SSO account for temp user
    const providerUserId = faker.string.uuid();
    await repository.create({
      user_id: tempUser.id,
      provider: SsoProviderEnum.google,
      provider_user_id: providerUserId,
      email: faker.internet.email().toLowerCase(),
    });

    // Verify SSO account exists
    const beforeDelete = await repository.findByProviderAndProviderId(
      SsoProviderEnum.google,
      providerUserId,
    );
    expect(beforeDelete).toBeDefined();

    // Delete the user
    await db
      .getOrCreateConnection()
      .deleteFrom("user")
      .where("id", "=", tempUser.id)
      .execute();

    // Verify SSO account was deleted by CASCADE
    const afterDelete = await repository.findByProviderAndProviderId(
      SsoProviderEnum.google,
      providerUserId,
    );
    expect(afterDelete).toBeUndefined();
  });

  it("should allow user with nullable password field (SSO-only user)", async () => {
    // Verify the SSO-only user was created with null password
    const user = await db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", testUserId2)
      .selectAll()
      .executeTakeFirst();

    expect(user).toBeDefined();
    expect(user?.password).toBeNull();

    // SSO-only user can have SSO accounts linked
    const ssoData = {
      user_id: testUserId2,
      provider: SsoProviderEnum.google,
      provider_user_id: faker.string.uuid(),
      email: faker.internet.email().toLowerCase(),
    };

    const created = await repository.create(ssoData);
    expect(created).toBeDefined();
    expect(created?.user_id).toBe(testUserId2);
  });

  it("should query SSO accounts by user_id", async () => {
    // Create multiple SSO accounts for a single user
    const googleProviderUserId = faker.string.uuid();
    const appleProviderUserId = faker.string.uuid();

    await repository.create({
      user_id: testUserId,
      provider: SsoProviderEnum.google,
      provider_user_id: googleProviderUserId,
      email: faker.internet.email().toLowerCase(),
    });

    await repository.create({
      user_id: testUserId,
      provider: SsoProviderEnum.apple,
      provider_user_id: appleProviderUserId,
      email: faker.internet.email().toLowerCase(),
    });

    // Query all SSO accounts for the user
    const userSsoAccounts = await repository.findByUserId(testUserId);

    expect(userSsoAccounts).toBeDefined();
    expect(userSsoAccounts.length).toBeGreaterThanOrEqual(2);

    // Verify both providers are linked
    const providers = userSsoAccounts.map((account) => account.provider);
    expect(providers).toContain(SsoProviderEnum.google);
    expect(providers).toContain(SsoProviderEnum.apple);
  });

  it("should return empty array when user has no SSO accounts", async () => {
    // Create a user with no SSO accounts
    const userWithNoSso = await db
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

    const ssoAccounts = await repository.findByUserId(userWithNoSso.id);

    expect(ssoAccounts).toEqual([]);

    // Clean up
    await db
      .getOrCreateConnection()
      .deleteFrom("user")
      .where("id", "=", userWithNoSso.id)
      .execute();
  });
});
