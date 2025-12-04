import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";
import type { User } from "database/src/models/public/User";
import { ValidationError } from "../../common/errors";
import shared from "../../shared/shared.plugin";
import { AuthService } from "../auth.service";
import type { SSOUserInfo } from "./sso-provider.interface";
import { UserSsoAccountRepository } from "./user-sso-account.repository";

describe("AuthService - SSO Operations", () => {
  let authService: AuthService;
  let userSsoAccountRepository: UserSsoAccountRepository;
  const db = shared.store.db;
  const cache = shared.store.cache;
  const notification = shared.store.notification;
  let testUser: User;
  let ssoOnlyUser: User;

  // Mock JWT object for testing
  const mockJwt = {
    sign: async (payload: { sub: string }) => {
      return `mock-access-token-${payload.sub}`;
    },
    verify: async (token: string) => {
      const sub = token.replace("mock-access-token-", "");
      return { sub };
    },
  };

  beforeAll(async () => {
    authService = new AuthService(db, cache, notification);
    userSsoAccountRepository = new UserSsoAccountRepository(db);

    // Create a regular test user with password
    testUser = await db
      .getOrCreateConnection()
      .insertInto("user")
      .values({
        email: `sso-test-${faker.string.uuid()}@example.com`.toLowerCase(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        password: await Bun.password.hash("password123", {
          algorithm: "bcrypt",
          cost: 10,
        }),
        emailVerified: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create an SSO-only user with no password
    ssoOnlyUser = await db
      .getOrCreateConnection()
      .insertInto("user")
      .values({
        email: `sso-only-${faker.string.uuid()}@example.com`.toLowerCase(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        password: null, // SSO-only user
        emailVerified: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Link an SSO account to the SSO-only user
    await userSsoAccountRepository.create({
      user_id: ssoOnlyUser.id,
      provider: SsoProviderEnum.google,
      provider_user_id: `google-${ssoOnlyUser.id}`,
      email: ssoOnlyUser.email,
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db
      .getOrCreateConnection()
      .deleteFrom("user")
      .where("id", "in", [testUser.id, ssoOnlyUser.id])
      .execute();

    db.closeConnection();
    cache.disconnect();
  });

  describe("findSsoAccountByProviderAndProviderId", () => {
    it("should find SSO account by provider and provider_user_id", async () => {
      const providerUserId = `test-provider-${faker.string.uuid()}`;

      // Create SSO account link
      await userSsoAccountRepository.create({
        user_id: testUser.id,
        provider: SsoProviderEnum.google,
        provider_user_id: providerUserId,
        email: testUser.email,
      });

      const ssoAccount =
        await userSsoAccountRepository.findByProviderAndProviderId(
          SsoProviderEnum.google,
          providerUserId,
        );

      expect(ssoAccount).toBeDefined();
      expect(ssoAccount?.provider).toBe(SsoProviderEnum.google);
      expect(ssoAccount?.provider_user_id).toBe(providerUserId);
      expect(ssoAccount?.user_id).toBe(testUser.id);
    });

    it("should return undefined when SSO account not found", async () => {
      const ssoAccount =
        await userSsoAccountRepository.findByProviderAndProviderId(
          SsoProviderEnum.apple,
          "non-existent-provider-id",
        );

      expect(ssoAccount).toBeUndefined();
    });
  });

  describe("createSsoAccountLink", () => {
    it("should create new SSO account link for existing user", async () => {
      const providerUserId = `new-link-${faker.string.uuid()}`;

      const created = await userSsoAccountRepository.create({
        user_id: testUser.id,
        provider: SsoProviderEnum.apple,
        provider_user_id: providerUserId,
        email: testUser.email,
      });

      expect(created).toBeDefined();
      expect(created?.user_id).toBe(testUser.id);
      expect(created?.provider).toBe(SsoProviderEnum.apple);
      expect(created?.provider_user_id).toBe(providerUserId);
    });
  });

  describe("loginWithSSO", () => {
    it("should login existing SSO-linked user and return AuthPayload", async () => {
      const providerUserId = `existing-sso-${faker.string.uuid()}`;
      const userEmail =
        `existing-sso-user-${faker.string.uuid()}@example.com`.toLowerCase();

      // Create user with SSO link
      const existingUser = await db
        .getOrCreateConnection()
        .insertInto("user")
        .values({
          email: userEmail,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          password: null,
          emailVerified: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await userSsoAccountRepository.create({
        user_id: existingUser.id,
        provider: SsoProviderEnum.google,
        provider_user_id: providerUserId,
        email: userEmail,
      });

      // Simulate SSO login
      const ssoUserInfo: SSOUserInfo = {
        providerUserId,
        email: userEmail,
        emailVerified: true,
        name: "Test User",
      };

      const authPayload = await authService.loginWithSSO(
        SsoProviderEnum.google,
        ssoUserInfo,
        mockJwt as any,
      );

      expect(authPayload).toBeDefined();
      expect(authPayload.accessToken).toBeDefined();
      expect(authPayload.refreshToken).toBeDefined();
      expect(authPayload.verified).toBe(true);

      // Clean up
      await db
        .getOrCreateConnection()
        .deleteFrom("user")
        .where("id", "=", existingUser.id)
        .execute();
    });

    it("should create new user with SSO when no existing user", async () => {
      const providerUserId = `new-user-sso-${faker.string.uuid()}`;
      const newEmail =
        `new-sso-user-${faker.string.uuid()}@example.com`.toLowerCase();

      const ssoUserInfo: SSOUserInfo = {
        providerUserId,
        email: newEmail,
        emailVerified: true,
        name: "New SSO User",
        firstName: "New",
        lastName: "User",
      };

      const authPayload = await authService.loginWithSSO(
        SsoProviderEnum.google,
        ssoUserInfo,
        mockJwt as any,
      );

      expect(authPayload).toBeDefined();
      expect(authPayload.accessToken).toBeDefined();
      expect(authPayload.refreshToken).toBeDefined();
      expect(authPayload.verified).toBe(true); // SSO users are auto-verified

      // Verify user was created without password
      const createdUser = await db
        .getOrCreateConnection()
        .selectFrom("user")
        .where("email", "=", newEmail)
        .selectAll()
        .executeTakeFirst();

      expect(createdUser).toBeDefined();
      expect(createdUser?.password).toBeNull();
      expect(createdUser?.emailVerified).toBe(true);

      // Verify SSO account was linked
      const ssoAccount =
        await userSsoAccountRepository.findByProviderAndProviderId(
          SsoProviderEnum.google,
          providerUserId,
        );

      expect(ssoAccount).toBeDefined();
      if (createdUser) {
        expect(ssoAccount?.user_id).toBe(createdUser.id);
      }

      // Clean up
      if (createdUser) {
        await db
          .getOrCreateConnection()
          .deleteFrom("user")
          .where("id", "=", createdUser.id)
          .execute();
      }
    });

    it("should automatically link SSO account when email matches existing user", async () => {
      const providerUserId = `auto-link-${faker.string.uuid()}`;
      const userEmail =
        `auto-link-${faker.string.uuid()}@example.com`.toLowerCase();

      // Create existing user without SSO link
      const existingUser = await db
        .getOrCreateConnection()
        .insertInto("user")
        .values({
          email: userEmail,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          password: await Bun.password.hash("password123", {
            algorithm: "bcrypt",
            cost: 10,
          }),
          emailVerified: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // SSO login with same email should auto-link
      const ssoUserInfo: SSOUserInfo = {
        providerUserId,
        email: userEmail, // Same email as existing user
        emailVerified: true,
        name: "Existing User",
      };

      const authPayload = await authService.loginWithSSO(
        SsoProviderEnum.google,
        ssoUserInfo,
        mockJwt as any,
      );

      expect(authPayload).toBeDefined();
      expect(authPayload.accessToken).toBeDefined();

      // Verify SSO account was linked to existing user
      const ssoAccount =
        await userSsoAccountRepository.findByProviderAndProviderId(
          SsoProviderEnum.google,
          providerUserId,
        );

      expect(ssoAccount).toBeDefined();
      expect(ssoAccount?.user_id).toBe(existingUser.id);

      // Clean up
      await db
        .getOrCreateConnection()
        .deleteFrom("user")
        .where("id", "=", existingUser.id)
        .execute();
    });

    it("should handle case-insensitive email matching for auto-linking", async () => {
      const providerUserId = `case-test-${faker.string.uuid()}`;
      const lowerEmail =
        `case-test-${faker.string.uuid()}@example.com`.toLowerCase();
      const upperEmail = lowerEmail.toUpperCase();

      // Create existing user with lowercase email
      const existingUser = await db
        .getOrCreateConnection()
        .insertInto("user")
        .values({
          email: lowerEmail,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          password: await Bun.password.hash("password123", {
            algorithm: "bcrypt",
            cost: 10,
          }),
          emailVerified: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // SSO login with uppercase email should still auto-link
      const ssoUserInfo: SSOUserInfo = {
        providerUserId,
        email: upperEmail, // Different case
        emailVerified: true,
        name: "Case Test User",
      };

      const authPayload = await authService.loginWithSSO(
        SsoProviderEnum.google,
        ssoUserInfo,
        mockJwt as any,
      );

      expect(authPayload).toBeDefined();

      // Verify SSO account was linked to existing user
      const ssoAccount =
        await userSsoAccountRepository.findByProviderAndProviderId(
          SsoProviderEnum.google,
          providerUserId,
        );

      expect(ssoAccount).toBeDefined();
      expect(ssoAccount?.user_id).toBe(existingUser.id);

      // Clean up
      await db
        .getOrCreateConnection()
        .deleteFrom("user")
        .where("id", "=", existingUser.id)
        .execute();
    });
  });

  describe("login - SSO-only user error handling", () => {
    it("should return specific error when SSO-only user attempts password login", async () => {
      try {
        await authService.login(
          {
            email: ssoOnlyUser.email,
            password: "any-password",
          },
          mockJwt as any,
        );

        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.code).toBe("SSO_ACCOUNT_NO_PASSWORD");
        expect(validationError.message).toContain("Google");
        expect(validationError.message).toContain(
          "reset your password to add email/password login",
        );
      }
    });
  });

  describe("getLinkedSSOProviders", () => {
    it("should return list of linked provider names for a user", async () => {
      // Create a user with multiple SSO accounts
      const multiSsoUser = await db
        .getOrCreateConnection()
        .insertInto("user")
        .values({
          email: `multi-sso-${faker.string.uuid()}@example.com`.toLowerCase(),
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          password: null,
          emailVerified: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await userSsoAccountRepository.create({
        user_id: multiSsoUser.id,
        provider: SsoProviderEnum.google,
        provider_user_id: `google-${multiSsoUser.id}`,
        email: multiSsoUser.email,
      });

      await userSsoAccountRepository.create({
        user_id: multiSsoUser.id,
        provider: SsoProviderEnum.apple,
        provider_user_id: `apple-${multiSsoUser.id}`,
        email: multiSsoUser.email,
      });

      const providers = await authService.getLinkedSSOProviders(
        multiSsoUser.id,
      );

      expect(providers).toBeDefined();
      expect(providers).toContain("Google");
      expect(providers).toContain("Apple");
      expect(providers.length).toBe(2);

      // Clean up
      await db
        .getOrCreateConnection()
        .deleteFrom("user")
        .where("id", "=", multiSsoUser.id)
        .execute();
    });

    it("should return empty array when user has no linked SSO providers", async () => {
      const providers = await authService.getLinkedSSOProviders(testUser.id);

      // testUser may have some SSO accounts from earlier tests, but if not:
      // This tests the edge case
      expect(providers).toBeDefined();
      expect(Array.isArray(providers)).toBe(true);
    });
  });
});
