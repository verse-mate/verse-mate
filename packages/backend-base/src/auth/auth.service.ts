import { randomUUID } from "node:crypto";
import { sql } from "database";
import type SsoProviderEnum from "database/src/models/public/SsoProviderEnum";
import type { User } from "database/src/models/public/User";

import { VerifyEmail, render } from "../../../emails";
import ResetPassword from "../../../emails/src/ResetPassword";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../common/errors";
import type { EmailNotificationConsumer } from "../queue/consumers/email-notification.consumer";
import cacheConstants from "../shared/cache.constants";
import type { JWT, cache, db } from "../shared/shared.plugin";
import type { AuthChangePasswordInput } from "./dto/auth-change-password.input";
import type { AuthForgotPasswordInput } from "./dto/auth-forgot-password.input";
import type { AuthLoginInput } from "./dto/auth-login.input";
import type { AuthResetPasswordInput } from "./dto/auth-reset-password.input";
import type { AuthSignupInput } from "./dto/auth-signup.input";
import type { AuthUpdateProfileInput } from "./dto/auth-update-profile.input";
import type { AuthPayload } from "./entities/auth.entity";
import { RefreshTokenRepository } from "./refresh-token.repository";
import type { SSOUserInfo } from "./sso/sso-provider.interface";
import { UserSsoAccountRepository } from "./sso/user-sso-account.repository";

function resetPasswordURL(key: string): string {
  return `${process.env.APP_URL ?? ""}/reset-password?key=${key}`;
}

function verifyEmailURL(key: string): string {
  return `${process.env.APP_URL ?? ""}/email-verified?key=${key}`;
}

/**
 * Format provider name for display (e.g., "google" -> "Google")
 */
function formatProviderName(provider: SsoProviderEnum | string): string {
  const name = String(provider);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export class AuthService {
  private readonly jwtConstants: {
    readonly hashSalt: number;
  };
  private readonly refreshTokenRepository: RefreshTokenRepository;
  private readonly userSsoAccountRepository: UserSsoAccountRepository;

  public constructor(
    private readonly db: db,
    private readonly cache: cache,
    private readonly notification: EmailNotificationConsumer,
  ) {
    const hashSalt = process.env.AUTH_HASH_SALT ?? "10";

    this.jwtConstants = {
      hashSalt: Number(hashSalt),
    };
    this.refreshTokenRepository = new RefreshTokenRepository(db);
    this.userSsoAccountRepository = new UserSsoAccountRepository(db);
  }

  private async validateUser(authLoginInput: AuthLoginInput): Promise<User> {
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("email", "=", authLoginInput.email)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Check if user has no password (SSO-only user)
    if (user.password === null) {
      // Get linked SSO providers for personalized error message
      const linkedProviders = await this.getLinkedSSOProviders(user.id);
      const providerList =
        linkedProviders.length > 0 ? linkedProviders.join("/") : "SSO";

      const error = new ValidationError(
        `This account uses ${providerList} Sign-In. Please use that method, or reset your password to add email/password login.`,
      );
      error.code = "SSO_ACCOUNT_NO_PASSWORD";
      throw error;
    }

    // if (!user.isActive) {
    //   throw new Error("INACTIVATED_USER");
    // }

    // TODO: User blacklist
    const validCredentials =
      user &&
      (await Bun.password.verify(
        authLoginInput.password,
        user.password,
        "bcrypt",
      ));

    if (!validCredentials) {
      throw new UnauthorizedError("Invalid credentials");
    }

    return user;
  }

  private async loginUser(
    user: User,
    jwt: JWT,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthPayload> {
    // Create short-lived access token (15 minutes)
    const accessToken = await jwt.sign({
      sub: user.id,
    });

    // Store access token in Redis
    const allAccessToken =
      (await this.cache.get<string[]>(cacheConstants.accessToken(user.id))) ||
      [];
    allAccessToken.push(accessToken);

    await this.cache.set(
      cacheConstants.accessToken(user.id),
      allAccessToken,
      "15m", // Short-lived access token
    );

    // Create long-lived refresh token (90 days) stored in database
    const refreshToken = randomUUID();
    const refreshTokenLifetime = 90 * 24 * 60 * 60 * 1000; // 90 days in ms
    const expiresAt = new Date(Date.now() + refreshTokenLifetime);

    await this.refreshTokenRepository.create({
      user_id: user.id,
      token: refreshToken,
      user_agent: userAgent || null,
      ip_address: ipAddress || null,
      expires_at: expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      verified: user.emailVerified,
    };
  }

  public async login(
    authLoginInput: AuthLoginInput,
    jwt: JWT,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthPayload> {
    const user = await this.validateUser(authLoginInput);
    return this.loginUser(user, jwt, userAgent, ipAddress);
  }

  /**
   * Authenticate a user via SSO (Single Sign-On)
   *
   * This method handles the following scenarios:
   * 1. Existing SSO link: Login the user
   * 2. No SSO link but email exists: Auto-link SSO to existing user
   * 3. No user exists: Create new user with SSO link
   *
   * @param provider - The SSO provider (google or apple)
   * @param ssoUserInfo - User information from the SSO provider
   * @param jwt - JWT handler for token generation
   * @param userAgent - Optional user agent string
   * @param ipAddress - Optional IP address
   * @returns AuthPayload with access token, refresh token, and verified status
   */
  public async loginWithSSO(
    provider: SsoProviderEnum,
    ssoUserInfo: SSOUserInfo,
    jwt: JWT,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthPayload> {
    const { providerUserId, email, emailVerified, firstName, lastName, name } =
      ssoUserInfo;
    const normalizedEmail = email.toLowerCase().trim();

    // Step 1: Check if SSO account is already linked
    const existingSsoAccount =
      await this.userSsoAccountRepository.findByProviderAndProviderId(
        provider,
        providerUserId,
      );

    if (existingSsoAccount) {
      // SSO account is already linked, get the user and login
      const user = await this.db
        .getOrCreateConnection()
        .selectFrom("user")
        .where("id", "=", existingSsoAccount.user_id)
        .selectAll()
        .executeTakeFirstOrThrow();

      return this.loginUser(user, jwt, userAgent, ipAddress);
    }

    // Step 2: Check if a user with this email already exists (case-insensitive)
    let user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where((eb) => eb(sql`LOWER(email)`, "=", normalizedEmail))
      .selectAll()
      .executeTakeFirst();

    if (user) {
      // User exists, create SSO link to existing account
      // Handle potential unique constraint race conditions
      try {
        await this.userSsoAccountRepository.create({
          user_id: user.id,
          provider,
          provider_user_id: providerUserId,
          email: normalizedEmail,
        });
      } catch (e) {
        // If unique constraint violation, check if link already exists
        const existing =
          await this.userSsoAccountRepository.findByProviderAndProviderId(
            provider,
            providerUserId,
          );
        if (!existing) {
          throw e;
        }
        // Link already exists, continue with login
      }

      // If user's email was not verified but SSO email is verified, mark as verified
      if (!user.emailVerified && emailVerified) {
        await this.db
          .getOrCreateConnection()
          .updateTable("user")
          .set({ emailVerified: true })
          .where("id", "=", user.id)
          .execute();

        // Update local user object
        user = { ...user, emailVerified: true };
      }

      return this.loginUser(user, jwt, userAgent, ipAddress);
    }

    // Step 3: No user exists, create new user with SSO (no password)
    // Parse name into first and last name if not provided separately
    let userFirstName = firstName;
    let userLastName = lastName;

    if (!userFirstName && name) {
      const nameParts = name.trim().split(/\s+/);
      userFirstName = nameParts[0] || "";
      userLastName = nameParts.slice(1).join(" ") || "";
    }

    const newUser = await this.db
      .getOrCreateConnection()
      .insertInto("user")
      .values({
        email: normalizedEmail,
        password: null, // SSO users don't have a password
        firstName: userFirstName || "User",
        lastName: userLastName || "",
        emailVerified: emailVerified, // SSO providers verify email
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create SSO link for the new user
    await this.userSsoAccountRepository.create({
      user_id: newUser.id,
      provider,
      provider_user_id: providerUserId,
      email: normalizedEmail,
    });

    return this.loginUser(newUser, jwt, userAgent, ipAddress);
  }

  /**
   * Get list of linked SSO provider names for a user
   *
   * @param userId - The user ID to check
   * @returns Array of formatted provider names (e.g., ["Google", "Apple"])
   */
  public async getLinkedSSOProviders(userId: string): Promise<string[]> {
    const ssoAccounts =
      await this.userSsoAccountRepository.findByUserId(userId);

    // Get unique providers and format their names
    const providers = [
      ...new Set(ssoAccounts.map((account) => account.provider)),
    ];

    return providers.map(formatProviderName);
  }

  public async refresh(refreshToken: string, jwt: JWT): Promise<AuthPayload> {
    // Find and validate refresh token
    const storedToken =
      await this.refreshTokenRepository.findByToken(refreshToken);

    if (!storedToken) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // Get user
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", storedToken.user_id)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Create new access token
    const accessToken = await jwt.sign({
      sub: user.id,
    });

    // Store access token in Redis
    const allAccessToken =
      (await this.cache.get<string[]>(cacheConstants.accessToken(user.id))) ||
      [];
    allAccessToken.push(accessToken);

    await this.cache.set(
      cacheConstants.accessToken(user.id),
      allAccessToken,
      "15m",
    );

    // Extend refresh token expiration (rolling window - 90 days from now)
    const refreshTokenLifetime = 90 * 24 * 60 * 60 * 1000;
    const newExpiresAt = new Date(Date.now() + refreshTokenLifetime);
    await this.refreshTokenRepository.updateLastUsed(
      storedToken.id,
      newExpiresAt,
    );

    return {
      accessToken,
      refreshToken, // Return same refresh token
      verified: user.emailVerified,
    };
  }

  public async saveUserSession(
    userId: string,
    sessionData: any,
  ): Promise<void> {
    const cacheKey = `user-session-${userId}`;
    await this.cache.set(cacheKey, sessionData, "1h"); // Salva a sessão por 1 hora
  }

  public async getUserSession(userId: string): Promise<any | null> {
    const cacheKey = `user-session-${userId}`;
    const sessionData = await this.cache.get<any>(cacheKey);
    return sessionData;
  }

  public async getUserById(
    userId: string,
  ): Promise<Pick<
    User,
    | "id"
    | "email"
    | "firstName"
    | "lastName"
    | "is_admin"
    | "preferred_language"
  > | null> {
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", userId)
      .select([
        "id",
        "email",
        "firstName",
        "lastName",
        "is_admin",
        "preferred_language",
      ])
      .executeTakeFirst();
    if (!user) return null;
    return user;
  }

  public async logout(
    accessToken: string,
    refreshToken: string | null,
    jwt: JWT,
  ): Promise<boolean> {
    const validBearer = await jwt.verify(accessToken);
    if (!validBearer || !validBearer.sub) {
      // TODO: return Error?
      return false;
    }

    const cacheKey = cacheConstants.accessToken(validBearer.sub);
    const allAccessTokens = await this.cache.get<string[]>(cacheKey);
    if (allAccessTokens?.includes(accessToken)) {
      const updated = allAccessTokens.filter((t) => t !== accessToken);

      if (updated.length === 0) {
        // Delete the key when empty to avoid extending TTL unnecessarily
        await this.cache.delete(cacheKey);
      } else {
        // Preserve original TTL to avoid extending other tokens' validity
        const ttlSeconds = await this.cache.ttl(cacheKey).catch(() => -1);
        if (ttlSeconds && ttlSeconds > 0) {
          await this.cache.set(cacheKey, updated, `${ttlSeconds}s`);
        } else {
          // If TTL unavailable or expired, delete to force re-auth on next check
          await this.cache.delete(cacheKey);
        }
      }
    }

    // Delete refresh token from database
    if (refreshToken) {
      await this.refreshTokenRepository.deleteByToken(refreshToken);
    }

    return true;
  }

  public async logoutAll(userId: string): Promise<boolean> {
    // Delete all access tokens from Redis
    await this.cache.delete(cacheConstants.accessToken(userId));

    // Delete all refresh tokens from database
    await this.refreshTokenRepository.deleteAllByUserId(userId);

    return true;
  }

  public async sendVerifyEmail(userId: string) {
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .select("email")
      .where("id", "=", userId)
      .executeTakeFirst();

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const uuid = randomUUID();
    await this.cache.set(
      cacheConstants.verifyEmail(uuid),
      { id: userId },
      "1h",
    );

    const href = verifyEmailURL(uuid);

    await this.notification.sendEmail({
      text: `Click the link to validate your email: ${href}`,
      subject: "Verify email address",
      to: {
        email: user.email,
        name: "",
      },
      html: render(VerifyEmail()),
    });
  }

  public async signup(
    authSignupInput: AuthSignupInput,
    jwt: JWT,
  ): Promise<AuthPayload> {
    const { password, email, firstName, lastName } = authSignupInput;
    const hashedPassword = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: this.jwtConstants.hashSalt,
    });

    const userByEmail = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("email", "=", email)
      .select("email")
      .executeTakeFirst();

    if (userByEmail) {
      throw new ConflictError("Email already exists");
    }

    const user = await this.db
      .getOrCreateConnection()
      .insertInto("user")
      .values({
        email,
        password: hashedPassword,
        firstName: firstName,
        lastName: lastName,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await this.sendVerifyEmail(user.id);

    return await this.login(
      {
        email,
        password,
      },
      jwt,
    );
  }

  public async changePassword(
    userId: string,
    authChangePasswordInput: AuthChangePasswordInput,
  ): Promise<boolean> {
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", userId)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      throw new UnauthorizedError("Invalid credentials");
    }

    await this.validateUser({
      email: user.email,
      password: authChangePasswordInput.currentPassword,
    });

    const hashedPassword = await Bun.password.hash(
      authChangePasswordInput.password,
      {
        algorithm: "bcrypt",
        cost: this.jwtConstants.hashSalt,
      },
    );

    await this.db
      .getOrCreateConnection()
      .updateTable("user")
      .set({
        email: user.email,
        password: hashedPassword,
      })
      .where("id", "=", userId)
      .execute();

    // Revoke all tokens on password change for security
    await this.logoutAll(userId);
    return true;
  }

  public async forgotPassword(
    authForgotPasswordInput: AuthForgotPasswordInput,
  ): Promise<boolean> {
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("email", "=", authForgotPasswordInput.email)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const uuid = randomUUID();
    await this.cache.set(
      cacheConstants.resetPassword(uuid),
      { id: user.id },
      "1h",
    );

    const href = resetPasswordURL(uuid);
    this.notification.sendEmail({
      to: {
        name: user.email,
        email: user.email,
      },

      subject: "Forgot password",
      text: `Click the link to reset your password: ${href}`,
      html: render(ResetPassword()),
    });

    return true;
  }

  public async resetPasswordVerify(token: string) {
    const cacheKey = cacheConstants.resetPassword(token);

    const payload = await this.cache.get<{ id: string }>(cacheKey);

    return Boolean(payload);
  }

  public async resetPassword(
    authResetPasswordInput: AuthResetPasswordInput,
  ): Promise<boolean> {
    const cacheKey = cacheConstants.resetPassword(authResetPasswordInput.key);
    const payload = await this.cache.get<{ id: string }>(cacheKey);
    if (!payload) {
      return false;
    }

    const hashedPassword = await Bun.password.hash(
      authResetPasswordInput.password,
      {
        algorithm: "bcrypt",
        cost: this.jwtConstants.hashSalt,
      },
    );
    await this.cache.delete(cacheKey);
    await this.logoutAll(payload.id);

    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", payload.id)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      // TODO: Return Error
      return false;
    }

    await this.db
      .getOrCreateConnection()
      .updateTable("user")
      .set({
        email: user.email,
        password: hashedPassword,
      })
      .where("id", "=", user.id)
      .execute();

    return true;
  }

  public async verifyEmail({
    token,
    jwt,
    currentUserId,
  }: {
    token: string;
    jwt: JWT;
    currentUserId: string;
  }): Promise<AuthPayload> {
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", currentUserId)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.emailVerified) {
      throw new ConflictError("User already verified");
    }

    const cacheKey = cacheConstants.verifyEmail(token);
    const payload = await this.cache.get<{ id: string }>(cacheKey);

    if (!payload) {
      throw new ValidationError("Invalid verification token");
    }

    if (user.id !== currentUserId) {
      throw new ConflictError("Verification link already used");
    }

    await this.cache.delete(cacheKey);

    await this.db
      .getOrCreateConnection()
      .updateTable("user")
      .set({
        emailVerified: true,
      })
      .where("id", "=", user.id)
      .execute();

    return this.loginUser(user, jwt);
  }

  public async updateProfile(
    userId: string,
    authUpdateProfileInput: AuthUpdateProfileInput,
  ): Promise<Pick<
    User,
    | "id"
    | "email"
    | "firstName"
    | "lastName"
    | "is_admin"
    | "preferred_language"
  > | null> {
    const { firstName, lastName, email } = authUpdateProfileInput;

    // Check if the new email is already taken by another user (case-insensitive)
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const existingUser = await this.db
        .getOrCreateConnection()
        .selectFrom("user")
        .where((eb) =>
          eb.and([
            eb(sql`LOWER(email)`, "=", normalizedEmail),
            eb("id", "!=", userId),
          ]),
        )
        .select("id")
        .executeTakeFirst();

      if (existingUser) {
        throw new ConflictError("Email already exists");
      }
    }

    // Build partial update payload to avoid nulling unspecified fields
    const updatePayload: Partial<
      Pick<User, "firstName" | "lastName" | "email">
    > = {};
    if (typeof firstName === "string")
      updatePayload.firstName = firstName.trim();
    if (typeof lastName === "string") updatePayload.lastName = lastName.trim();
    if (typeof email === "string")
      updatePayload.email = email.toLowerCase().trim();

    if (Object.keys(updatePayload).length > 0) {
      await this.db
        .getOrCreateConnection()
        .updateTable("user")
        .set(updatePayload)
        .where("id", "=", userId)
        .execute();
    }

    // Return the updated user information
    return this.getUserById(userId);
  }

  /**
   * Delete user account and all associated data
   *
   * This method permanently deletes a user's account and all related data
   * from the database. It requires password verification for email/password
   * accounts but skips it for SSO-only accounts (where password is null).
   *
   * Data deleted includes:
   * - User record
   * - All refresh tokens (sessions)
   * - SSO account links
   * - Reading progress and history
   * - Notes, highlights, and favorites
   * - Conversations and ratings
   * - Theme preferences
   *
   * @param userId - The ID of the user to delete
   * - password - The user's current password (required for email/password accounts)
   * @throws UnauthorizedError if password is incorrect or required but not provided
   * @throws NotFoundError if user doesn't exist
   */
  public async deleteAccount(userId: string, password?: string): Promise<void> {
    // Get user to check if password is needed
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", userId)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // For email/password accounts, require password verification
    if (user.password !== null) {
      if (!password) {
        const error = new ValidationError(
          "Password is required to delete your account",
        );
        error.code = "PASSWORD_REQUIRED";
        throw error;
      }

      // Verify password is correct
      const validPassword = await Bun.password.verify(
        password,
        user.password,
        "bcrypt",
      );

      if (!validPassword) {
        throw new UnauthorizedError("Invalid password");
      }
    }

    // Clear all access tokens from Redis first (before transaction)
    await this.cache.delete(cacheConstants.accessToken(userId));

    // Delete all user data in a transaction to ensure atomicity
    await this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        // Delete dependent data first (order matters for foreign key constraints)
        // 1. Explanation ratings
        await trx
          .deleteFrom("explanation_ratings")
          .where("user_id", "=", userId)
          .execute();

        // 2. Conversations (will cascade to messages via FK)
        await trx
          .deleteFrom("conversations")
          .where("user_id", "=", userId)
          .execute();

        // 3. Favorites
        await trx
          .deleteFrom("favorites")
          .where("user_id", "=", userId)
          .execute();

        // 4. Notes
        await trx.deleteFrom("notes").where("user_id", "=", userId).execute();

        // 5. Verse highlights
        await trx
          .deleteFrom("verse_highlights")
          .where("user_id", "=", userId)
          .execute();

        // 6. User theme preferences
        await trx
          .deleteFrom("user_theme_preferences")
          .where("user_id", "=", userId)
          .execute();

        // 7. User viewed book introductions
        await trx
          .deleteFrom("user_viewed_book_introductions")
          .where("user_id", "=", userId)
          .execute();

        // 8. User recently viewed books
        await trx
          .deleteFrom("user_recently_viewed_books")
          .where("user_id", "=", userId)
          .execute();

        // 9. User progress
        await trx
          .deleteFrom("user_progress")
          .where("user_id", "=", userId)
          .execute();

        // 10. User SSO accounts
        await trx
          .deleteFrom("user_sso_accounts")
          .where("user_id", "=", userId)
          .execute();

        // 11. Refresh tokens
        await trx
          .deleteFrom("refresh_tokens")
          .where("user_id", "=", userId)
          .execute();

        // 12. Delete user record last
        await trx.deleteFrom("user").where("id", "=", userId).execute();
      });

    // Transaction completed successfully
  }

  // TODO: Implement refresh accessToken (keep alive)
}
