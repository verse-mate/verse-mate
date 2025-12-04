/**
 * SSO Password Reset Integration Tests
 *
 * These tests verify that SSO-only users can use the password reset flow
 * to add email/password login capability to their accounts.
 *
 * Key scenarios tested:
 * 1. SSO-only user requests password reset
 * 2. SSO-only user completes password reset and sets a password
 * 3. After reset, user can login with email/password OR SSO
 * 4. Multiple SSO providers linked to same account work correctly
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";
import cacheConstants from "../../shared/cache.constants";
import shared from "../../shared/shared.plugin";
import { AuthService } from "../auth.service";
import type { SSOUserInfo } from "./sso-provider.interface";
import { UserSsoAccountRepository } from "./user-sso-account.repository";

describe("SSO Password Reset Integration", () => {
  let authService: AuthService;
  let userSsoAccountRepository: UserSsoAccountRepository;
  const db = shared.store.db;
  const cache = shared.store.cache;
  const notification = shared.store.notification;

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
  });

  afterAll(async () => {
    db.closeConnection();
    cache.disconnect();
  });

  describe("Password Reset Flow for SSO-Only Users", () => {
    it("should allow SSO-only user to request password reset", async () => {
      // Create SSO-only user
      const ssoUserEmail =
        `sso-reset-test-${faker.string.uuid()}@example.com`.toLowerCase();
      const ssoUser = await db
        .getOrCreateConnection()
        .insertInto("user")
        .values({
          email: ssoUserEmail,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          password: null, // SSO-only user has no password
          emailVerified: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Link Google SSO account
      await userSsoAccountRepository.create({
        user_id: ssoUser.id,
        provider: SsoProviderEnum.google,
        provider_user_id: `google-reset-${ssoUser.id}`,
        email: ssoUserEmail,
      });

      try {
        // SSO-only user should be able to request password reset
        // The forgotPassword method checks if user exists and sends reset email
        const result = await authService.forgotPassword({
          email: ssoUserEmail,
        });

        expect(result).toBe(true);

        // Verify reset token was created (check cache for reset password key)
        // Note: We can't easily verify the exact key since it's a UUID,
        // but the method returning true confirms it worked
      } finally {
        // Clean up
        await db
          .getOrCreateConnection()
          .deleteFrom("user")
          .where("id", "=", ssoUser.id)
          .execute();
      }
    });

    it("should allow SSO-only user to set password via reset flow and then login with email/password", async () => {
      // Create SSO-only user
      const ssoUserEmail =
        `sso-to-password-${faker.string.uuid()}@example.com`.toLowerCase();
      const ssoUser = await db
        .getOrCreateConnection()
        .insertInto("user")
        .values({
          email: ssoUserEmail,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          password: null, // SSO-only user
          emailVerified: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Link Google SSO account
      await userSsoAccountRepository.create({
        user_id: ssoUser.id,
        provider: SsoProviderEnum.google,
        provider_user_id: `google-password-${ssoUser.id}`,
        email: ssoUserEmail,
      });

      try {
        // Simulate the password reset flow by creating a reset token
        const resetKey = faker.string.uuid();
        await cache.set(
          cacheConstants.resetPassword(resetKey),
          { id: ssoUser.id },
          "1h",
        );

        // Complete password reset
        const newPassword = "NewSecurePassword123!";
        const resetResult = await authService.resetPassword({
          key: resetKey,
          password: newPassword,
        });

        expect(resetResult).toBe(true);

        // Verify user now has a password set
        const updatedUser = await db
          .getOrCreateConnection()
          .selectFrom("user")
          .where("id", "=", ssoUser.id)
          .selectAll()
          .executeTakeFirst();

        expect(updatedUser).toBeDefined();
        expect(updatedUser?.password).not.toBeNull();

        // User should now be able to login with email/password
        const authPayload = await authService.login(
          { email: ssoUserEmail, password: newPassword },
          mockJwt as any,
        );

        expect(authPayload).toBeDefined();
        expect(authPayload.accessToken).toBeDefined();
        expect(authPayload.refreshToken).toBeDefined();
      } finally {
        // Clean up
        await db
          .getOrCreateConnection()
          .deleteFrom("user")
          .where("id", "=", ssoUser.id)
          .execute();
      }
    });

    it("should still allow SSO login after password is set via reset", async () => {
      // Create SSO-only user
      const ssoUserEmail =
        `sso-both-methods-${faker.string.uuid()}@example.com`.toLowerCase();
      const providerUserId = `google-both-${faker.string.uuid()}`;

      const ssoUser = await db
        .getOrCreateConnection()
        .insertInto("user")
        .values({
          email: ssoUserEmail,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          password: null, // SSO-only user initially
          emailVerified: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Link Google SSO account
      await userSsoAccountRepository.create({
        user_id: ssoUser.id,
        provider: SsoProviderEnum.google,
        provider_user_id: providerUserId,
        email: ssoUserEmail,
      });

      try {
        // Set password via reset flow
        const resetKey = faker.string.uuid();
        await cache.set(
          cacheConstants.resetPassword(resetKey),
          { id: ssoUser.id },
          "1h",
        );

        await authService.resetPassword({
          key: resetKey,
          password: "NewPassword123!",
        });

        // User should still be able to login via SSO
        const ssoUserInfo: SSOUserInfo = {
          providerUserId,
          email: ssoUserEmail,
          emailVerified: true,
          name: "Test User",
        };

        const ssoAuthPayload = await authService.loginWithSSO(
          SsoProviderEnum.google,
          ssoUserInfo,
          mockJwt as any,
        );

        expect(ssoAuthPayload).toBeDefined();
        expect(ssoAuthPayload.accessToken).toBeDefined();
        expect(ssoAuthPayload.refreshToken).toBeDefined();
      } finally {
        // Clean up
        await db
          .getOrCreateConnection()
          .deleteFrom("user")
          .where("id", "=", ssoUser.id)
          .execute();
      }
    });
  });

  describe("Multiple SSO Providers Linked to Same Account", () => {
    it("should allow user to login with either SSO provider when multiple are linked", async () => {
      const userEmail =
        `multi-provider-${faker.string.uuid()}@example.com`.toLowerCase();
      const googleProviderUserId = `google-multi-${faker.string.uuid()}`;
      const appleProviderUserId = `apple-multi-${faker.string.uuid()}`;

      // Create user
      const user = await db
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

      // Link both Google and Apple
      await userSsoAccountRepository.create({
        user_id: user.id,
        provider: SsoProviderEnum.google,
        provider_user_id: googleProviderUserId,
        email: userEmail,
      });

      await userSsoAccountRepository.create({
        user_id: user.id,
        provider: SsoProviderEnum.apple,
        provider_user_id: appleProviderUserId,
        email: userEmail,
      });

      try {
        // Login with Google SSO
        const googleAuthPayload = await authService.loginWithSSO(
          SsoProviderEnum.google,
          {
            providerUserId: googleProviderUserId,
            email: userEmail,
            emailVerified: true,
          },
          mockJwt as any,
        );

        expect(googleAuthPayload).toBeDefined();
        expect(googleAuthPayload.accessToken).toBeDefined();

        // Login with Apple SSO (same user, different provider)
        const appleAuthPayload = await authService.loginWithSSO(
          SsoProviderEnum.apple,
          {
            providerUserId: appleProviderUserId,
            email: userEmail,
            emailVerified: true,
          },
          mockJwt as any,
        );

        expect(appleAuthPayload).toBeDefined();
        expect(appleAuthPayload.accessToken).toBeDefined();

        // Both logins should result in same user (different access tokens, but same user)
        // We can verify by checking linked providers
        const linkedProviders = await authService.getLinkedSSOProviders(
          user.id,
        );
        expect(linkedProviders).toContain("Google");
        expect(linkedProviders).toContain("Apple");
        expect(linkedProviders.length).toBe(2);
      } finally {
        // Clean up
        await db
          .getOrCreateConnection()
          .deleteFrom("user")
          .where("id", "=", user.id)
          .execute();
      }
    });

    it("should show both providers in error message when SSO-only user with multiple providers tries password login", async () => {
      const userEmail =
        `multi-sso-error-${faker.string.uuid()}@example.com`.toLowerCase();

      // Create user with no password
      const user = await db
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

      // Link both providers
      await userSsoAccountRepository.create({
        user_id: user.id,
        provider: SsoProviderEnum.google,
        provider_user_id: `google-error-${user.id}`,
        email: userEmail,
      });

      await userSsoAccountRepository.create({
        user_id: user.id,
        provider: SsoProviderEnum.apple,
        provider_user_id: `apple-error-${user.id}`,
        email: userEmail,
      });

      try {
        await authService.login(
          { email: userEmail, password: "any-password" },
          mockJwt as any,
        );

        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe("SSO_ACCOUNT_NO_PASSWORD");
        // Error message should mention both providers
        expect(error.message).toContain("Google");
        expect(error.message).toContain("Apple");
      } finally {
        // Clean up
        await db
          .getOrCreateConnection()
          .deleteFrom("user")
          .where("id", "=", user.id)
          .execute();
      }
    });
  });

  describe("SSO Email Case Sensitivity", () => {
    it("should link SSO account to existing user with different email case", async () => {
      const lowerEmail =
        `case-test-link-${faker.string.uuid()}@example.com`.toLowerCase();
      const mixedCaseEmail =
        lowerEmail.substring(0, 5).toUpperCase() + lowerEmail.substring(5);
      const providerUserId = `google-case-${faker.string.uuid()}`;

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

      try {
        // SSO login with mixed case email from Google
        const ssoUserInfo: SSOUserInfo = {
          providerUserId,
          email: mixedCaseEmail, // Different case than stored
          emailVerified: true,
          name: "Case Test User",
        };

        const authPayload = await authService.loginWithSSO(
          SsoProviderEnum.google,
          ssoUserInfo,
          mockJwt as any,
        );

        expect(authPayload).toBeDefined();
        expect(authPayload.accessToken).toBeDefined();

        // Verify SSO account was linked to existing user (not a new user created)
        const ssoAccount =
          await userSsoAccountRepository.findByProviderAndProviderId(
            SsoProviderEnum.google,
            providerUserId,
          );

        expect(ssoAccount).toBeDefined();
        expect(ssoAccount?.user_id).toBe(existingUser.id);

        // Verify no new user was created
        const allUsersWithSimilarEmail = await db
          .getOrCreateConnection()
          .selectFrom("user")
          .where("email", "ilike", `%${lowerEmail.split("@")[0]}%`)
          .selectAll()
          .execute();

        expect(allUsersWithSimilarEmail.length).toBe(1);
        expect(allUsersWithSimilarEmail[0].id).toBe(existingUser.id);
      } finally {
        // Clean up
        await db
          .getOrCreateConnection()
          .deleteFrom("user")
          .where("id", "=", existingUser.id)
          .execute();
      }
    });
  });
});
