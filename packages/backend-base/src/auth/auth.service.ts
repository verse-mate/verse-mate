import { randomUUID } from "node:crypto";
import { sql } from "database";
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

function resetPasswordURL(key: string): string {
  return `${process.env.APP_URL ?? ""}/reset-password?key=${key}`;
}

function verifyEmailURL(key: string): string {
  return `${process.env.APP_URL ?? ""}/email-verified?key=${key}`;
}

export class AuthService {
  private readonly jwtConstants: {
    readonly hashSalt: number;
  };

  public constructor(
    private readonly db: db,
    private readonly cache: cache,
    private readonly notification: EmailNotificationConsumer,
    private readonly jwt: JWT,
  ) {
    const hashSalt = process.env.AUTH_HASH_SALT ?? "10";

    this.jwtConstants = {
      hashSalt: Number(hashSalt),
    };
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

  private async loginUser(user: User, jwt: JWT): Promise<AuthPayload> {
    const accessToken = await jwt.sign({
      sub: user.id,
    });

    const allAccessToken =
      (await this.cache.get<string[]>(cacheConstants.accessToken(user.id))) ||
      [];
    allAccessToken.push(accessToken);

    await this.cache.set(
      cacheConstants.accessToken(user.id),
      allAccessToken,
      process.env.AUTH_ACCESS_TOKEN_LIFETIME ?? "1h",
    );

    return {
      accessToken,
      verified: user.emailVerified,
    };
  }

  public async login(
    authLoginInput: AuthLoginInput,
    jwt: JWT,
  ): Promise<AuthPayload> {
    const user = await this.validateUser(authLoginInput);
    return this.loginUser(user, jwt);
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

  public async logout(accessToken: string, jwt: JWT): Promise<boolean> {
    const validBearer = await jwt.verify(accessToken);
    if (!validBearer || !validBearer.sub) {
      // TODO: return Error?
      return false;
    }

    const cacheKey = cacheConstants.accessToken(validBearer.sub);
    const allAccessTokens = await this.cache.get<string[]>(cacheKey);
    if (!allAccessTokens || !allAccessTokens.includes(accessToken)) {
      return false;
    }

    const index = allAccessTokens.findIndex((t) => t === accessToken);
    allAccessTokens.splice(index, 1);

    await this.cache.set(
      cacheKey,
      allAccessTokens,
      process.env.AUTH_ACCESS_TOKEN_LIFETIME ?? "1h",
    );

    return true;
  }

  public async logoutAll(userId: string): Promise<boolean> {
    await this.cache.delete(cacheConstants.accessToken(userId));

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

    // TODO: Logout all, but the current one
    // await this.logoutAll(userId);
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

  // TODO: Implement refresh accessToken (keep alive)

  /**
   * Refreshes an access token for a user, implementing a sliding session.
   * It generates a new token and replaces the old one in the cache.
   * @param oldToken The expired or expiring token.
   * @param userId The ID of the user.
   * @returns The new access token, or null if the old token was not found.
   */
  public async refreshAccessToken(
    oldToken: string,
    userId: string,
  ): Promise<string | null> {
    const cacheKey = cacheConstants.accessToken(userId);
    const allAccessTokens = await this.cache.get<string[]>(cacheKey);

    if (!allAccessTokens || !allAccessTokens.includes(oldToken)) {
      // If the token isn't in the list, we can't refresh it.
      // This could happen if the user was logged out from another device.
      return null;
    }

    // Generate a new token
    const newToken = await this.jwt.sign({
      sub: userId,
    });

    // Atomically replace the old token with the new one
    const index = allAccessTokens.findIndex((t) => t === oldToken);
    allAccessTokens.splice(index, 1, newToken);

    await this.cache.set(
      cacheKey,
      allAccessTokens,
      process.env.AUTH_ACCESS_TOKEN_LIFETIME ?? "1h",
    );

    return newToken;
  }
}
