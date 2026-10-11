import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "database";
import type Database from "database/src/models/Database";
import type SsoProviderEnum from "database/src/models/public/SsoProviderEnum";
import type { User } from "database/src/models/public/User";
import type { Transaction } from "kysely";

import {
  ConfirmEmailChange,
  EmailChangeAccountExists,
  EmailChanged,
  VerifyEmail,
  render,
} from "../../../emails";
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
import type { SSOUserInfo } from "./sso/sso-provider.interface";
import { UserSsoAccountRepository } from "./sso/user-sso-account.repository";

const SESSION_LIFETIME = "90d";
const SESSION_LIMIT = 50;
const EMAIL_CHANGE_LIFETIME = "1h";
const EMAIL_CHANGE_WINDOW_SECONDS = 60 * 60;
const EMAIL_CHANGE_MAILS_PER_HOUR = 3;
const EMAIL_CHANGE_MAILS_PER_RECIPIENT = 3;
const EMAIL_CHANGE_REQUESTS_PER_HOUR = 30;
const EMAIL_CHANGE_TRIES = 5;
const EMAIL_CHANGE_REVERT_LIFETIME = "7d";
const UNIQUE_VIOLATION = "23505";

type AccountProfile = Pick<
  User,
  | "id"
  | "email"
  | "firstName"
  | "lastName"
  | "is_admin"
  | "preferred_language"
  | "imageSrc"
> & { hasPassword: boolean; pendingEmail: string | null };

type PendingEmailChange = {
  requestId: string;
  from: string;
  to: string;
  requestedAt: number;
};

type EmailChangeKey = Omit<PendingEmailChange, "requestedAt"> & {
  userId: string;
};

type EmailChangeRevert = {
  userId: string;
  from: string;
  to: string;
  changedAt: string;
};

type AddressProof =
  | { by: "account-holder" }
  | { by: "password-reset" }
  | { by: "provider"; provider: SsoProviderEnum; providerUserId: string };

function resetPasswordURL(key: string): string {
  return `${process.env.APP_URL ?? ""}/reset-password?key=${key}`;
}

function emailChangeURL(key: string): string {
  return `${process.env.BACKEND_URL ?? "http://localhost:3001"}/auth/confirm-email-change?key=${key}`;
}

function revertEmailChangeURL(key: string): string {
  return `${process.env.BACKEND_URL ?? "http://localhost:3001"}/auth/revert-email-change?key=${key}`;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
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
  private readonly userSsoAccountRepository: UserSsoAccountRepository;
  public emailChangeSettleMs = 15_000;

  public constructor(
    private readonly db: db,
    private readonly cache: cache,
    private readonly notification: EmailNotificationConsumer,
  ) {
    const hashSalt = process.env.AUTH_HASH_SALT ?? "10";

    this.jwtConstants = {
      hashSalt: Number(hashSalt),
    };
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
      jti: randomUUID(),
    });

    await this.cache.appendToJsonArray(
      cacheConstants.accessToken(user.id),
      accessToken,
      SESSION_LIFETIME,
      SESSION_LIMIT,
    );

    return {
      accessToken,
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
    const session = await this.loginUser(user, jwt, userAgent, ipAddress);
    const current = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .select("password")
      .where("id", "=", user.id)
      .executeTakeFirst();
    if (current?.password !== user.password) {
      await this.cache.removeFromJsonArray(
        cacheConstants.accessToken(user.id),
        session.accessToken,
      );
      throw new UnauthorizedError("Invalid credentials");
    }
    return session;
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
    const {
      providerUserId,
      email,
      emailVerified,
      firstName,
      lastName,
      name,
      picture,
    } = ssoUserInfo;
    const normalizedEmail = email.toLowerCase().trim();

    // Step 1: Check if SSO account is already linked
    const existingSsoAccount =
      await this.userSsoAccountRepository.findByProviderAndProviderId(
        provider,
        providerUserId,
      );

    if (existingSsoAccount) {
      const user = await this.db
        .getOrCreateConnection()
        .selectFrom("user")
        .where("id", "=", existingSsoAccount.user_id)
        .selectAll()
        .executeTakeFirstOrThrow();

      if (!emailVerified && normalizedEmail) {
        const otherLinks = await this.db
          .getOrCreateConnection()
          .selectFrom("user_sso_accounts")
          .select("id")
          .where("user_id", "=", user.id)
          .where("provider_user_id", "!=", providerUserId)
          .executeTakeFirst();
        if (user.password || otherLinks)
          throw new ConflictError(
            "The sign-in provider has not verified this email. Sign in another way instead.",
          );
      }

      const confirms =
        emailVerified &&
        !this.isConfirmed(user) &&
        user.email.trim().toLowerCase() === normalizedEmail;
      if (confirms) {
        const confirmation = await this.db
          .getOrCreateConnection()
          .transaction()
          .execute(async (trx) => {
            const locked = await trx
              .selectFrom("user")
              .select(["id", "emailVerified", "email_verified_at"])
              .where("id", "=", user.id)
              .where(sql`lower(trim(email))`, "=", normalizedEmail)
              .forUpdate()
              .executeTakeFirst();
            if (!locked) return null;
            if (this.isConfirmed(locked)) return { signOutOthers: false };
            return this.confirmAddress(trx, locked, normalizedEmail, {
              by: "provider",
              provider,
              providerUserId,
            });
          });
        if (!confirmation)
          throw new ConflictError(
            "The account's email changed while signing in. Sign in again.",
          );
        if (confirmation.signOutOthers) await this.logoutAll(user.id);
      }
      const session = await this.loginUser(
        confirms ? { ...user, emailVerified: true } : user,
        jwt,
        userAgent,
        ipAddress,
      );
      const stillLinked = await this.db
        .getOrCreateConnection()
        .selectFrom("user_sso_accounts")
        .select("id")
        .where("user_id", "=", user.id)
        .where("provider", "=", provider)
        .where("provider_user_id", "=", providerUserId)
        .executeTakeFirst();
      if (!stillLinked) {
        await this.cache.removeFromJsonArray(
          cacheConstants.accessToken(user.id),
          session.accessToken,
        );
        throw new ConflictError(
          "The account changed while signing in. Sign in again.",
        );
      }
      if (picture && picture !== user.imageSrc)
        await this.db
          .getOrCreateConnection()
          .updateTable("user")
          .set({ imageSrc: picture, picture_source: provider as any })
          .where("id", "=", user.id)
          .where(({ exists, selectFrom }) =>
            exists(
              selectFrom("user_sso_accounts")
                .select("id")
                .whereRef("user_sso_accounts.user_id", "=", "user.id")
                .where("provider", "=", provider)
                .where("provider_user_id", "=", providerUserId),
            ),
          )
          .execute();
      return session;
    }

    // Step 2: Check if a user with this email already exists (case-insensitive)
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where((eb) => eb(sql`LOWER(email)`, "=", normalizedEmail))
      .selectAll()
      .executeTakeFirst();

    if (user) {
      if (!emailVerified)
        throw new ConflictError(
          "The sign-in provider has not verified this email. Verify it with the provider or sign in another way.",
        );
      const { userToLogin, signOutOthers } = await this.db
        .getOrCreateConnection()
        .transaction()
        .execute(async (trx) => {
          const locked = await trx
            .selectFrom("user")
            .selectAll()
            .where("id", "=", user.id)
            .where(sql`lower(trim(email))`, "=", normalizedEmail)
            .forUpdate()
            .executeTakeFirst();
          if (!locked)
            throw new ConflictError(
              "The account's email changed while signing in. Sign in again.",
            );
          const confirmed = locked.emailVerified;
          const linked = await trx
            .insertInto("user_sso_accounts")
            .values({
              user_id: locked.id,
              provider,
              provider_user_id: providerUserId,
              email: normalizedEmail,
            })
            .onConflict((oc) =>
              oc.columns(["provider", "provider_user_id"]).doNothing(),
            )
            .returning("user_id")
            .executeTakeFirst();
          if (!linked) {
            const owner = await trx
              .selectFrom("user_sso_accounts")
              .select("user_id")
              .where("provider", "=", provider)
              .where("provider_user_id", "=", providerUserId)
              .executeTakeFirstOrThrow();
            if (owner.user_id !== locked.id)
              throw new ConflictError(
                "This sign-in is linked to another account.",
              );
          }
          const updates: Record<string, unknown> = {
            ...(!confirmed && locked.password ? { password: null } : {}),
          };
          if (picture && picture !== locked.imageSrc) {
            updates.imageSrc = picture;
            updates.picture_source = provider as any;
          }
          if (Object.keys(updates).length > 0)
            await trx
              .updateTable("user")
              .set(updates)
              .where("id", "=", locked.id)
              .execute();
          const confirmation = this.isConfirmed(locked)
            ? { signOutOthers: false }
            : await this.confirmAddress(trx, locked, normalizedEmail, {
                by: "provider",
                provider,
                providerUserId,
              });
          if (!confirmation)
            throw new ConflictError(
              "The account's email changed while signing in. Sign in again.",
            );
          return {
            userToLogin: {
              ...locked,
              ...updates,
              emailVerified: true,
            } as User,
            signOutOthers: confirmation.signOutOthers,
          };
        });

      if (signOutOthers) await this.logoutAll(userToLogin.id);
      return this.loginUser(userToLogin, jwt, userAgent, ipAddress);
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

    if (!emailVerified && normalizedEmail)
      throw new ConflictError(
        "The sign-in provider has not verified this email. Verify it with the provider or sign in another way.",
      );

    const newUser = await this.db
      .getOrCreateConnection()
      .insertInto("user")
      .values({
        email: normalizedEmail,
        password: null, // SSO users don't have a password
        firstName: userFirstName || "User",
        lastName: userLastName || "",
        emailVerified: emailVerified, // SSO providers verify email
        imageSrc: picture || null,
        picture_source: (picture ? provider : null) as any,
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

  // refresh() removed per D-005: access token IS the persistent session;
  // server-side Redis cache validates every token so logout immediately
  // revokes regardless of JWT expiry.

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

  public async getUserById(userId: string): Promise<AccountProfile | null> {
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
        "imageSrc",
        "password",
      ])
      .executeTakeFirst();
    if (!user) return null;

    const pending = await this.cache.get<PendingEmailChange>(
      cacheConstants.emailChangePending(userId),
    );
    const { password, ...userData } = user;
    return {
      ...userData,
      hasPassword: password !== null,
      pendingEmail:
        pending?.from === user.email.trim().toLowerCase() ? pending.to : null,
    };
  }

  public async logout(accessToken: string, jwt: JWT): Promise<boolean> {
    const validBearer = await jwt.verify(accessToken);
    if (!validBearer || !validBearer.sub) {
      // TODO: return Error?
      return false;
    }

    await this.cache.removeFromJsonArray(
      cacheConstants.accessToken(validBearer.sub),
      accessToken,
    );
    return true;
  }

  private isConfirmed(user: Pick<User, "emailVerified" | "email_verified_at">) {
    return user.emailVerified && user.email_verified_at !== null;
  }

  private async confirmAddress(
    trx: Transaction<Database>,
    user: Pick<User, "id" | "emailVerified">,
    address: string,
    proof: AddressProof,
  ): Promise<{ signOutOthers: boolean } | null> {
    const stamped = await trx
      .updateTable("user")
      .set({ emailVerified: true, email_verified_at: sql`now()` })
      .where("id", "=", user.id)
      .where(sql`lower(trim(email))`, "=", address)
      .executeTakeFirst();
    if (Number(stamped.numUpdatedRows) === 0) return null;

    let unproven = trx
      .deleteFrom("user_sso_accounts")
      .where("user_id", "=", user.id);
    if (proof.by === "account-holder")
      unproven = unproven.where(sql`lower(trim(email))`, "=", address);
    if (proof.by === "provider") {
      await trx
        .updateTable("user_sso_accounts")
        .set({ email: address })
        .where("user_id", "=", user.id)
        .where("provider", "=", proof.provider)
        .where("provider_user_id", "=", proof.providerUserId)
        .execute();
      unproven = unproven.where((eb) =>
        eb.not(
          eb.and([
            eb("provider", "=", proof.provider),
            eb("provider_user_id", "=", proof.providerUserId),
          ]),
        ),
      );
    }
    const dropped = await unproven.executeTakeFirst();
    const linksDropped = Number(dropped.numDeletedRows);
    if (proof.by === "account-holder") {
      const keptElsewhere = await trx
        .selectFrom("user_sso_accounts")
        .select("id")
        .where("user_id", "=", user.id)
        .executeTakeFirst();
      if (keptElsewhere)
        await trx
          .updateTable("user")
          .set({ email_verified_at: null })
          .where("id", "=", user.id)
          .execute();
    }
    const signOutOthers =
      linksDropped > 0 ||
      (proof.by !== "account-holder" && !user.emailVerified);
    if (signOutOthers)
      console.info("Address confirmation took the account back", {
        userId: user.id,
        proof: proof.by,
        linksDropped,
        signOutOthers,
      });
    return { signOutOthers };
  }

  public async logoutAll(userId: string): Promise<boolean> {
    // Delete all access tokens from Redis. Per D-005 there are no refresh
    // tokens in DB to clean up — access token IS the session.
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
      { id: userId, email: user.email.trim().toLowerCase() },
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
      html: render(VerifyEmail({ href })),
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

    if (
      userByEmail ||
      (await this.reservedForAnother(email.trim().toLowerCase(), null))
    ) {
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

    const checked = await this.validateUser({
      email: user.email,
      password: authChangePasswordInput.currentPassword,
    });
    if (checked.id !== userId) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const hashedPassword = await Bun.password.hash(
      authChangePasswordInput.password,
      {
        algorithm: "bcrypt",
        cost: this.jwtConstants.hashSalt,
      },
    );

    const changed = await this.db
      .getOrCreateConnection()
      .updateTable("user")
      .set({ password: hashedPassword })
      .where("id", "=", userId)
      .where("password", "=", checked.password)
      .executeTakeFirst();
    if (Number(changed.numUpdatedRows) === 0) {
      throw new UnauthorizedError("Invalid credentials");
    }

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
      { id: user.id, email: user.email.trim().toLowerCase() },
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
      html: render(ResetPassword({ href })),
    });

    return true;
  }

  private async resetPasswordHolder(token: string) {
    const payload = await this.cache.get<{ id: string; email?: string }>(
      cacheConstants.resetPassword(token),
    );
    if (!payload?.email) return undefined;
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", payload.id)
      .where(sql`lower(trim(email))`, "=", payload.email)
      .selectAll()
      .executeTakeFirst();
    return user ? { user, email: payload.email } : undefined;
  }

  public async resetPasswordVerify(token: string) {
    return Boolean(await this.resetPasswordHolder(token));
  }

  public async resetPassword(
    authResetPasswordInput: AuthResetPasswordInput,
  ): Promise<boolean> {
    const holder = await this.resetPasswordHolder(authResetPasswordInput.key);
    if (!holder) {
      return false;
    }
    const { user, email } = holder;

    const hashedPassword = await Bun.password.hash(
      authResetPasswordInput.password,
      {
        algorithm: "bcrypt",
        cost: this.jwtConstants.hashSalt,
      },
    );
    await this.cache.delete(
      cacheConstants.resetPassword(authResetPasswordInput.key),
    );

    const reset = await this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        const locked = await trx
          .selectFrom("user")
          .selectAll()
          .where("id", "=", user.id)
          .where(sql`lower(trim(email))`, "=", email)
          .forUpdate()
          .executeTakeFirst();
        if (!locked) return false;

        await trx
          .updateTable("user")
          .set({ password: hashedPassword })
          .where("id", "=", locked.id)
          .execute();

        if (
          !this.isConfirmed(locked) &&
          !(await this.confirmAddress(trx, locked, email, {
            by: "password-reset",
          }))
        )
          throw new ConflictError(
            "The account's email changed during the reset. Request a new link.",
          );
        return true;
      });
    if (reset) await this.logoutAll(user.id);
    return reset;
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

    if (user.emailVerified && user.email_verified_at) {
      throw new ConflictError("User already verified");
    }

    const cacheKey = cacheConstants.verifyEmail(token);
    const payload = await this.cache.get<{ id: string; email?: string }>(
      cacheKey,
    );

    if (!payload || payload.email !== user.email.trim().toLowerCase()) {
      throw new ValidationError("Invalid verification token");
    }

    // Security (audit #3): bind the token to the account it was issued for. The
    // cached payload.id is the account the verification token was minted for;
    // it must match the caller. The previous `user.id !== currentUserId` check
    // was tautological (user was selected BY currentUserId), so any valid token
    // — including one minted for a different account — could verify this one.
    if (payload.id !== currentUserId) {
      throw new ConflictError("Verification link already used");
    }

    await this.cache.delete(cacheKey);

    const address = user.email.trim().toLowerCase();
    const confirmed = await this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        const locked = await trx
          .selectFrom("user")
          .select(["id", "emailVerified", "email_verified_at"])
          .where("id", "=", user.id)
          .where(sql`lower(trim(email))`, "=", address)
          .forUpdate()
          .executeTakeFirst();
        if (!locked) return null;
        if (this.isConfirmed(locked)) return { signOutOthers: false };
        return this.confirmAddress(trx, locked, address, {
          by: "account-holder",
        });
      });
    if (!confirmed) throw new ValidationError("Invalid verification token");
    if (confirmed.signOutOthers) await this.logoutAll(user.id);

    return this.loginUser({ ...user, emailVerified: true }, jwt);
  }

  public async updateProfile(
    userId: string,
    authUpdateProfileInput: AuthUpdateProfileInput,
  ): Promise<AccountProfile | null> {
    const { firstName, lastName, email } = authUpdateProfileInput;

    const current = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .select("email")
      .where("id", "=", userId)
      .executeTakeFirst();
    if (!current) return null;

    const from = current.email.trim().toLowerCase();
    const to = typeof email === "string" ? email.trim().toLowerCase() : from;
    const pending = await this.cache.get<PendingEmailChange>(
      cacheConstants.emailChangePending(userId),
    );
    const alreadyPending = pending?.from === from && pending.to === to;
    const newRequest = to !== from && !alreadyPending;
    if (newRequest) await this.checkEmailChangeLimits(userId);

    const names: Partial<Pick<User, "firstName" | "lastName">> = {};
    if (typeof firstName === "string") names.firstName = firstName.trim();
    if (typeof lastName === "string") names.lastName = lastName.trim();
    if (Object.keys(names).length > 0)
      await this.db
        .getOrCreateConnection()
        .updateTable("user")
        .set(names)
        .where("id", "=", userId)
        .execute();

    if (newRequest) await this.requestEmailChange(userId, from, to);
    else if (
      alreadyPending &&
      Date.now() - pending.requestedAt > this.emailChangeSettleMs
    )
      this.scheduleEmailChangeMail(userId, pending.requestId, 0);

    return this.getUserById(userId);
  }

  private async checkEmailChangeLimits(userId: string) {
    const tooMany = async (cacheKey: string, max: number) => {
      if (((await this.cache.get<number>(cacheKey)) ?? 0) < max) return;
      const retryAfter = await this.cache.ttl(cacheKey).catch(() => -1);
      throw {
        status: 429,
        message: "Too many email changes. Try again later.",
        ...(retryAfter > 0 ? { retryAfter } : {}),
      };
    };
    await tooMany(
      cacheConstants.emailChangeMailsSent(userId),
      EMAIL_CHANGE_MAILS_PER_HOUR,
    );
    await tooMany(
      cacheConstants.emailChangeRequests(userId),
      EMAIL_CHANGE_REQUESTS_PER_HOUR,
    );
    await this.cache.increment(
      cacheConstants.emailChangeRequests(userId),
      EMAIL_CHANGE_WINDOW_SECONDS,
    );
  }

  private async requestEmailChange(userId: string, from: string, to: string) {
    const requestId = randomUUID();
    await this.cache.set(
      cacheConstants.emailChangePending(userId),
      {
        requestId,
        from,
        to,
        requestedAt: Date.now(),
      } satisfies PendingEmailChange,
      EMAIL_CHANGE_LIFETIME,
    );
    this.scheduleEmailChangeMail(userId, requestId, this.emailChangeSettleMs);
  }

  private scheduleEmailChangeMail(
    userId: string,
    requestId: string,
    delayMs: number,
  ) {
    setTimeout(() => {
      this.mailEmailChange(userId, requestId).catch((error) =>
        console.error("Email change mail failed", { userId, error }),
      );
    }, delayMs);
  }

  private async mailEmailChange(userId: string, requestId: string) {
    const pendingKey = cacheConstants.emailChangePending(userId);
    const pending = await this.cache.get<PendingEmailChange>(pendingKey);
    if (pending?.requestId !== requestId) return;
    const conn = this.db.getOrCreateConnection();
    const holder = await conn
      .selectFrom("user")
      .select("id")
      .where("id", "=", userId)
      .where(sql`lower(trim(email))`, "=", pending.from)
      .executeTakeFirst();
    if (!holder) return;
    const mailing = cacheConstants.emailChangeMailing(requestId);
    if (!(await this.cache.claim(mailing, EMAIL_CHANGE_LIFETIME))) return;

    const sent = await this.cache.increment(
      cacheConstants.emailChangeMailsSent(userId),
      EMAIL_CHANGE_WINDOW_SECONDS,
    );
    if (sent > EMAIL_CHANGE_MAILS_PER_HOUR) {
      console.warn("Email change mail over the hourly limit", { userId });
      await this.cache.deleteWhen(pendingKey, "requestId", requestId);
      return;
    }
    const toRecipient = await this.cache.increment(
      cacheConstants.emailChangeMailsTo(hashKey(pending.to)),
      EMAIL_CHANGE_WINDOW_SECONDS,
    );
    if (toRecipient > EMAIL_CHANGE_MAILS_PER_RECIPIENT) {
      console.warn("Email change mail over the recipient limit", { userId });
      return;
    }

    const taken = await conn
      .selectFrom("user")
      .select("id")
      .where(sql`lower(trim(email))`, "=", pending.to)
      .where("id", "!=", userId)
      .executeTakeFirst();
    if (taken || (await this.reservedForAnother(pending.to, userId))) {
      const result = await this.notification.sendEmail({
        to: { email: pending.to, name: "" },
        subject: "Someone tried to use this email address",
        text: "Someone asked to move a VerseMate account to this email address, but this address already has a VerseMate account. Nothing was changed. If it was you, sign in with this address instead.",
        html: render(EmailChangeAccountExists()),
      });
      if (!result.delivered && !result.suppressed)
        console.error("Email change mail was not delivered", {
          userId,
          error: result.error,
        });
      return;
    }

    const key = randomBytes(32).toString("base64url");
    const keyRecord = cacheConstants.emailChangeKey(hashKey(key));
    await this.cache.set(
      keyRecord,
      {
        userId,
        requestId,
        from: pending.from,
        to: pending.to,
      } satisfies EmailChangeKey,
      EMAIL_CHANGE_LIFETIME,
    );
    const href = emailChangeURL(key);
    const result = await this.notification.sendEmail({
      to: { email: pending.to, name: "" },
      subject: "Confirm your new email address",
      text: `Open this link to confirm the new email address of your VerseMate account: ${href}`,
      html: render(ConfirmEmailChange({ href })),
    });
    if (!result.delivered && !result.suppressed) {
      console.error("Email change mail was not delivered", {
        userId,
        error: result.error,
      });
      await this.cache.delete(keyRecord);
      await this.cache.delete(mailing);
    }
  }

  private async liveEmailChangeKey(hash: string) {
    const record = await this.cache.get<EmailChangeKey>(
      cacheConstants.emailChangeKey(hash),
    );
    if (!record) return null;
    const pending = await this.cache.get<PendingEmailChange>(
      cacheConstants.emailChangePending(record.userId),
    );
    return pending?.requestId === record.requestId ? record : null;
  }

  private async reservedForAnother(
    address: string,
    userId: string | null,
  ): Promise<boolean> {
    const reservation = await this.cache.get<{ userId: string }>(
      cacheConstants.emailChangeReserved(hashKey(address)),
    );
    return Boolean(reservation && reservation.userId !== userId);
  }

  public async emailChangeRevertUsable(key: string): Promise<boolean> {
    return Boolean(
      await this.cache.get(cacheConstants.emailChangeRevert(hashKey(key))),
    );
  }

  public async revertEmailChange(key: string): Promise<boolean> {
    const record = await this.cache.take<EmailChangeRevert>(
      cacheConstants.emailChangeRevert(hashKey(key)),
    );
    if (!record) return false;
    let reverted: boolean;
    try {
      reverted = await this.db
        .getOrCreateConnection()
        .transaction()
        .execute(async (trx) => {
          const locked = await trx
            .selectFrom("user")
            .select(["id"])
            .where("id", "=", record.userId)
            .forUpdate()
            .executeTakeFirst();
          if (!locked) return false;
          const other = await trx
            .selectFrom("user")
            .select("id")
            .where(sql`lower(trim(email))`, "=", record.from)
            .where("id", "!=", record.userId)
            .executeTakeFirst();
          if (other) return false;
          await trx
            .updateTable("user")
            .set({ email: record.from, password: null })
            .where("id", "=", locked.id)
            .execute();
          await trx
            .deleteFrom("user_sso_accounts")
            .where("user_id", "=", locked.id)
            .where("created_at", ">=", new Date(record.changedAt))
            .execute();
          if (
            !(await this.confirmAddress(
              trx,
              { id: locked.id, emailVerified: false },
              record.from,
              { by: "account-holder" },
            ))
          )
            throw new Error("The old address could not be confirmed");
          return true;
        });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return false;
      throw error;
    }
    if (!reverted) return false;
    await this.logoutAll(record.userId);
    await this.cache.delete(cacheConstants.emailChangePending(record.userId));
    await this.cache.delete(
      cacheConstants.emailChangeReserved(hashKey(record.from)),
    );
    console.info("Email change undone from the old address", {
      userId: record.userId,
    });
    return true;
  }

  public async emailChangeKeyUsable(key: string): Promise<boolean> {
    return Boolean(await this.liveEmailChangeKey(hashKey(key)));
  }

  public async confirmEmailChange(
    key: string,
    typedEmail: string,
  ): Promise<"confirmed" | "wrong-address" | "unusable"> {
    const hash = hashKey(key);
    const typed = typedEmail.trim().toLowerCase();
    const done = await this.cache.get<{ from: string }>(
      cacheConstants.emailChangeDone(hash),
    );
    if (done) return done.from === typed ? "confirmed" : "unusable";

    const tries = await this.cache.increment(
      cacheConstants.emailChangeTries(hash),
      EMAIL_CHANGE_WINDOW_SECONDS,
    );
    if (tries > EMAIL_CHANGE_TRIES) {
      await this.cache.delete(cacheConstants.emailChangeKey(hash));
      return "unusable";
    }
    const record = await this.liveEmailChangeKey(hash);
    if (!record) return "unusable";

    let outcome: "moved" | "already" | "wrong-address" | "unusable";
    try {
      outcome = await this.db
        .getOrCreateConnection()
        .transaction()
        .execute(async (trx) => {
          const locked = await trx
            .selectFrom("user")
            .select(["id", "email", "emailVerified", "email_verified_at"])
            .where("id", "=", record.userId)
            .forUpdate()
            .executeTakeFirst();
          if (!locked) return "unusable";
          const current = locked.email.trim().toLowerCase();
          if (current === record.to && typed === record.from) return "already";
          if (typed !== current) return "wrong-address";
          if (current !== record.from) return "unusable";

          const taken = await this.cache.takeWhen<EmailChangeKey>(
            cacheConstants.emailChangeKey(hash),
            {
              key: cacheConstants.emailChangePending(record.userId),
              field: "requestId",
              value: record.requestId,
            },
          );
          if (taken?.requestId !== record.requestId) return "unusable";
          const other = await trx
            .selectFrom("user")
            .select("id")
            .where(sql`lower(trim(email))`, "=", record.to)
            .where("id", "!=", record.userId)
            .executeTakeFirst();
          if (
            other ||
            (await this.reservedForAnother(record.to, record.userId))
          )
            return "unusable";
          await trx
            .updateTable("user")
            .set({ email: record.to })
            .where("id", "=", locked.id)
            .execute();
          if (
            !(await this.confirmAddress(trx, locked, record.to, {
              by: "account-holder",
            }))
          )
            throw new Error("The new address could not be confirmed");
          if (!this.isConfirmed(locked))
            await trx
              .updateTable("user")
              .set({ password: null })
              .where("id", "=", locked.id)
              .execute();
          return "moved";
        });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION)
        return "unusable";
      throw error;
    }
    if (outcome === "already") return "confirmed";
    if (outcome === "wrong-address") {
      if (tries === EMAIL_CHANGE_TRIES) {
        await this.cache.delete(cacheConstants.emailChangeKey(hash));
        return "unusable";
      }
      return "wrong-address";
    }
    if (outcome === "unusable") return "unusable";

    await this.logoutAll(record.userId);
    await this.cache.set(
      cacheConstants.emailChangeDone(hash),
      { from: record.from },
      EMAIL_CHANGE_LIFETIME,
    );
    await this.cache.deleteWhen(
      cacheConstants.emailChangePending(record.userId),
      "requestId",
      record.requestId,
    );
    await this.cache.delete(cacheConstants.emailChangeTries(hash));
    try {
      const revertKey = randomBytes(32).toString("base64url");
      await this.cache.set(
        cacheConstants.emailChangeRevert(hashKey(revertKey)),
        {
          userId: record.userId,
          from: record.from,
          to: record.to,
          changedAt: new Date().toISOString(),
        } satisfies EmailChangeRevert,
        EMAIL_CHANGE_REVERT_LIFETIME,
      );
      await this.cache.set(
        cacheConstants.emailChangeReserved(hashKey(record.from)),
        { userId: record.userId },
        EMAIL_CHANGE_REVERT_LIFETIME,
      );
      const href = revertEmailChangeURL(revertKey);
      const result = await this.notification.sendEmail({
        to: { email: record.from, name: "" },
        subject: "Your VerseMate email address was changed",
        text: `The email address of your VerseMate account was changed and every session was signed out. If you did not do this, undo it within 7 days: ${href}`,
        html: render(EmailChanged({ href })),
      });
      if (!result.delivered && !result.suppressed)
        console.error("Email change notice was not delivered", {
          userId: record.userId,
          error: result.error,
        });
    } catch (error) {
      console.error("Email change notice failed", {
        userId: record.userId,
        error,
      });
    }
    return "confirmed";
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
   * - Ratings
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

    // Delete all user data in a transaction to ensure atomicity
    await this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        const locked = await trx
          .selectFrom("user")
          .select(["password", "email", "email_verified_at"])
          .where("id", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (
          !locked ||
          locked.password !== user.password ||
          locked.email !== user.email ||
          locked.email_verified_at?.getTime() !==
            user.email_verified_at?.getTime()
        )
          throw new ConflictError(
            "The account changed while deleting it. Sign in again.",
          );
        // Delete dependent data first (order matters for foreign key constraints)
        // 1. Explanation ratings
        await trx
          .deleteFrom("explanation_ratings")
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

        // 11. Refresh tokens — table dropped per D-005 migration; no-op here.

        // 12. Delete user record last
        await trx.deleteFrom("user").where("id", "=", userId).execute();
      });

    await this.cache.delete(cacheConstants.accessToken(userId));
  }

  // TODO: Implement refresh accessToken (keep alive)
}
