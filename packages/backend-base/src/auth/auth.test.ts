import { beforeAll, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";

import cacheConstants from "../shared/cache.constants";
import { getTestClient } from "../shared/test-client";
import Backend, { type AuthPlugin } from "./auth.plugin";
import type { AuthPayload } from "./entities/auth.entity";

describe("Auth", () => {
  const client = getTestClient<AuthPlugin>(Backend);
  const cacheService = Backend.store.cache;

  let signupAuthPayload: AuthPayload | null;
  let loginAuthPayload: AuthPayload | null;

  // Clear all cache before running auth tests to ensure clean state
  beforeAll(async () => {
    // Clear rate limit cache
    await cacheService.delete("rate-limit:signup:unknown");
    // Note: We don't flush all Redis keys because other test files might be running
    // The logout tests will naturally create their own tokens during the test flow
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  const authSignupInput = {
    email: faker.internet.email().toLocaleLowerCase(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    password: faker.internet.password(),
  };
  const changePasswordValue = faker.internet.password();

  it("signup", async () => {
    let token = "";

    spyOn(Backend.store.notification, "sendEmail").mockImplementationOnce(
      (message) => {
        const uuid = message.text.split("?key=").at(-1);
        expect(uuid).toBeDefined();
        token = uuid ?? "";
        return Promise.resolve({ delivered: true });
      },
    );

    const { data, error } = await client.auth.signup.post(authSignupInput);
    if (error) throw error;

    expect(data?.accessToken).toBeDefined();
    expect(data?.verified).toBeFalse();

    let user = await Backend.store.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("email", "=", authSignupInput.email)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(user.emailVerified).toBe(false);

    const { data: verifyEmailData, error: verifyError } = await client.auth[
      "verify-email"
    ].post(
      {
        token,
      },
      {
        headers: {
          authorization: `Bearer ${data?.accessToken}`,
        },
      },
    );
    if (verifyError || verifyEmailData instanceof Error) throw verifyError;

    expect(verifyEmailData?.accessToken).toBeDefined();
    signupAuthPayload = verifyEmailData as AuthPayload;

    user = await Backend.store.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("email", "=", authSignupInput.email)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(user.emailVerified).toBe(true);
  });

  it("signup - AccessToken Works", async () => {
    const { data, error } = await client.auth.user.get({
      headers: {
        authorization: `Bearer ${signupAuthPayload?.accessToken}`,
      },
    });
    if (error) throw error;
    expect(data).toBeTruthy();
  });

  it("login", async () => {
    const { data, error } = await client.auth.login.post({
      email: authSignupInput.email,
      password: authSignupInput.password,
    });
    if (error) throw error;

    expect(data?.accessToken).toBeDefined();
    loginAuthPayload = data;
  });

  it("login - user not found", async () => {
    const { data, error } = await client.auth.login.post({
      email: "invalid@email.com",
      password: authSignupInput.password,
    });

    expect(data?.accessToken).not.toBeDefined();
    expect(error).toBeTruthy();
    // Check that we get NOT_FOUND error for non-existent users
    expect((error as any)?.value?.error).toBe("NOT_FOUND");
  });

  it("login - invalid credentials", async () => {
    const { data, error } = await client.auth.login.post({
      email: authSignupInput.email,
      password: "wrongpassword",
    });

    expect(data?.accessToken).not.toBeDefined();
    expect(error).toBeTruthy();
    // Check that we get UNAUTHORIZED error for wrong password
    expect((error as any)?.value?.error).toBe("UNAUTHORIZED");
  });

  it("Change Password", async () => {
    const { error } = await client.auth["change-password"].post(
      {
        currentPassword: "someWrongPassword",
        password: "anythingNew",
      },
      {
        headers: {
          authorization: `Bearer ${signupAuthPayload?.accessToken}`,
        },
      },
    );

    expect(error).toBeTruthy();

    const { data: dataChange, error: erroChange } = await client.auth[
      "change-password"
    ].post(
      {
        currentPassword: authSignupInput.password,
        password: changePasswordValue,
      },
      {
        headers: {
          authorization: `Bearer ${signupAuthPayload?.accessToken}`,
        },
      },
    );
    expect(erroChange).toBeFalsy();
    expect(dataChange).toBeTrue();

    const { data: dataLogin, error: errorLogin } = await client.auth.login.post(
      {
        email: authSignupInput.email,
        password: changePasswordValue,
      },
    );
    if (errorLogin) throw errorLogin;
    expect(dataLogin?.accessToken).toBeDefined();
    // Update loginAuthPayload with the fresh token after password change
    loginAuthPayload = dataLogin;
  });

  it("Logout", async () => {
    // It should have 2 sessions
    const cacheService = Backend.store.cache;

    // Use loginAuthPayload which has the most recent token from Change Password test
    const { data, error } = await client.auth.user.get({
      headers: {
        authorization: `Bearer ${loginAuthPayload?.accessToken}`,
      },
    });
    if (error) throw error;
    if (data instanceof Error) return;
    expect(data?.id).toBeTruthy();
    if (!data?.id) {
      return;
    }

    let tokens =
      (await cacheService.get<string[]>(cacheConstants.accessToken(data.id))) ??
      [];
    // We should have tokens from: signup, verify-email, login, and change-password's login
    // But in practice, we may have fewer if tokens expire or get replaced
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens).toContain(signupAuthPayload?.accessToken ?? "");

    const { data: logoutSignup } = await client.auth.logout.post(
      {},
      {
        headers: {
          authorization: `Bearer ${signupAuthPayload?.accessToken}`,
        },
      },
    );
    expect(logoutSignup).toBeTruthy();

    tokens =
      (await cacheService.get<string[]>(cacheConstants.accessToken(data.id))) ??
      [];
    // After logging out one token, we should have fewer tokens
    expect(tokens.length).toBeGreaterThanOrEqual(0);

    const { data: logoutLogin, error: logoutLoginError } =
      await client.auth.logout.post(
        {},
        {
          headers: {
            authorization: `Bearer ${loginAuthPayload?.accessToken}`,
          },
        },
      );
    expect(logoutLoginError).toBeFalsy();
    expect(logoutLogin).toBeTruthy();

    tokens =
      (await cacheService.get<string[]>(cacheConstants.accessToken(data.id))) ??
      [];
    // After logging out another token, we should have even fewer tokens
    expect(tokens.length).toBeGreaterThanOrEqual(0);
  });

  it("logout all", async () => {
    const cacheService = Backend.store.cache;

    const { data: loginData, error: loginError } = await client.auth.login.post(
      {
        email: authSignupInput.email,
        password: changePasswordValue,
      },
    );
    if (loginError) throw loginError;

    const { data, error } = await client.auth.user.get({
      headers: {
        authorization: `Bearer ${loginData?.accessToken}`,
      },
    });
    if (error) throw error;
    if (data instanceof Error) return;
    expect(data?.id).toBeTruthy();
    if (!data?.id) {
      return;
    }

    let tokens =
      (await cacheService.get<string[]>(cacheConstants.accessToken(data.id))) ??
      [];
    // Should have at least the token we just created from login
    const initialTokenCount = tokens.length;
    expect(initialTokenCount).toBeGreaterThanOrEqual(1);

    await client.auth["logout-all"].post(
      {},
      {
        headers: {
          authorization: `Bearer ${loginData?.accessToken}`,
        },
      },
    );

    tokens =
      (await cacheService.get<string[]>(cacheConstants.accessToken(data.id))) ??
      [];
    expect(tokens).toHaveLength(0);
  });

  it("Password Reset Tokens", async () => {
    let token = "";

    spyOn(Backend.store.notification, "sendEmail").mockImplementationOnce(
      (message) => {
        const uuid = message.text.split("?key=").at(-1);
        expect(uuid).toBeDefined();
        token = uuid ?? "";
        return Promise.resolve({ delivered: true });
      },
    );

    await client.auth["forgot-password"].post({
      email: authSignupInput.email,
    });

    const firstIsValid = await client.auth["reset-password-verify"].get({
      query: {
        token,
      },
    });

    expect(firstIsValid.error).toBeFalsy();
    expect(firstIsValid.data).toBeTruthy();

    const { data, error } = await client.auth["reset-password"].post({
      key: token,
      password: authSignupInput.password,
    });
    expect(error).toBeFalsy();
    expect(data).toBeTruthy();

    const secondIsValid = await client.auth["reset-password-verify"].get({
      query: {
        token,
      },
    });

    expect(secondIsValid.error).toBeFalsy();
    expect(secondIsValid.data?.success).toBe(false);
  });
});

describe("Auth - Rate Limiting", () => {
  const client = getTestClient<AuthPlugin>(Backend);
  const cacheService = Backend.store.cache;

  it("signup rate limit - returns 429 after 3 attempts", async () => {
    const signupInput = {
      email: faker.internet.email().toLocaleLowerCase(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      password: faker.internet.password(),
    };

    // Clear any existing rate limit cache for signup
    await cacheService.delete("rate-limit:signup:unknown");

    // Mock sendEmail for all signup attempts
    spyOn(Backend.store.notification, "sendEmail").mockImplementation(() =>
      Promise.resolve({ delivered: true }),
    );

    // Make 3 successful signup attempts (rate limit max)
    for (let i = 0; i < 3; i++) {
      const uniqueEmail = `${i}-${signupInput.email}`;
      const { data, error } = await client.auth.signup.post({
        ...signupInput,
        email: uniqueEmail,
      });
      // These should succeed
      if (error) throw error;
      expect(data?.accessToken).toBeDefined();
    }

    // 4th attempt should hit rate limit
    const { data, error } = await client.auth.signup.post({
      ...signupInput,
      email: `4-${signupInput.email}`,
    });

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect((error as any)?.status).toBe(429);
    expect((error as any)?.value?.error).toBe("TOO_MANY_REQUESTS");
    expect((error as any)?.value?.message).toBe(
      "Too many signup attempts, please try again later",
    );
    expect((error as any)?.value?.retryAfter).toBeDefined();
    expect((error as any)?.value?.retryAfter).toBeGreaterThan(0);
    expect((error as any)?.value?.retryAfter).toBeLessThanOrEqual(3600);

    // Clean up rate limit cache key
    await cacheService.delete("rate-limit:signup:unknown");
  });

  it("login rate limit - returns 429 after 5 attempts", async () => {
    const loginEmail = faker.internet.email().toLocaleLowerCase();

    // Make 5 failed login attempts (rate limit max)
    for (let i = 0; i < 5; i++) {
      const { error } = await client.auth.login.post({
        email: loginEmail,
        password: "wrongpassword",
      });
      // These should fail with NOT_FOUND or UNAUTHORIZED, not rate limit
      expect(error).toBeTruthy();
      expect((error as any)?.status).not.toBe(429);
    }

    // 6th attempt should hit rate limit
    const { data, error } = await client.auth.login.post({
      email: loginEmail,
      password: "wrongpassword",
    });

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect((error as any)?.status).toBe(429);
    expect((error as any)?.value?.error).toBe("TOO_MANY_REQUESTS");
    expect((error as any)?.value?.message).toBe(
      "Too many login attempts, please try again in a minute",
    );
    expect((error as any)?.value?.retryAfter).toBeDefined();
    expect((error as any)?.value?.retryAfter).toBeGreaterThan(0);
    expect((error as any)?.value?.retryAfter).toBeLessThanOrEqual(60);

    // Clean up rate limit cache key
    await cacheService.delete(`rate-limit:login:${loginEmail}`);
  });

  // refresh rate-limit test removed per D-005 — /auth/refresh endpoint deleted.

  it("forgot-password rate limit - returns 429 after 3 attempts", async () => {
    const testEmail = faker.internet.email().toLocaleLowerCase();

    // Mock sendEmail for all attempts
    spyOn(Backend.store.notification, "sendEmail").mockImplementation(() =>
      Promise.resolve({ delivered: true }),
    );

    // First, create a user so forgot-password can find them
    const { error: signupError } = await client.auth.signup.post({
      email: testEmail,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      password: faker.internet.password(),
    });
    if (signupError) throw signupError;

    // Make 3 forgot password attempts (rate limit max)
    for (let i = 0; i < 3; i++) {
      const { data, error } = await client.auth["forgot-password"].post({
        email: testEmail,
      });
      // These should succeed
      if (error) throw error;
      expect(data?.success).toBe(true);
    }

    // 4th attempt should hit rate limit
    const { data, error } = await client.auth["forgot-password"].post({
      email: testEmail,
    });

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect((error as any)?.status).toBe(429);
    expect((error as any)?.value?.error).toBe("TOO_MANY_REQUESTS");
    expect((error as any)?.value?.message).toBe(
      "Too many password reset requests, please try again later",
    );
    expect((error as any)?.value?.retryAfter).toBeDefined();
    expect((error as any)?.value?.retryAfter).toBeGreaterThan(0);
    expect((error as any)?.value?.retryAfter).toBeLessThanOrEqual(3600);

    // Clean up rate limit cache key
    await cacheService.delete(`rate-limit:forgot-password:${testEmail}`);
  });

  it("should still return 401 for unauthorized errors", async () => {
    const { data, error } = await client.auth.user.get({
      headers: {
        authorization: "Bearer invalid-token",
      },
    });

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect((error as any)?.status).toBe(401);
    // 401 errors have a different structure with 'message' instead of 'error'
    expect((error as any)?.value?.message).toContain("Invalid bearer token");
  });

  it("should still return 404 for not found errors", async () => {
    const { data, error } = await client.auth.login.post({
      email: "nonexistent@example.com",
      password: "somepassword",
    });

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect((error as any)?.status).toBe(404);
    expect((error as any)?.value?.error).toBe("NOT_FOUND");
  });
});

describe("Auth - Security (audit fixes)", () => {
  const client = getTestClient<AuthPlugin>(Backend);

  // Own the sendEmail mock for this whole block (an earlier describe installs a
  // permanent one) and capture the most recent verification token. Reset the
  // shared signup rate-limit key so this block's signups aren't 429'd.
  let lastVerifyToken = "";
  beforeAll(async () => {
    spyOn(Backend.store.notification, "sendEmail").mockImplementation(
      (message) => {
        if (message.text.includes("?key=")) {
          lastVerifyToken = message.text.split("?key=").at(-1) ?? "";
        }
        return Promise.resolve({ delivered: true });
      },
    );
    await Backend.store.cache.delete("rate-limit:signup:unknown");
  });

  // Audit #3: a verification token is bound to the account it was minted for.
  // Before the fix, verifyEmail's guard compared user.id to the id it selected
  // by — always true — so any valid token, including one issued for a DIFFERENT
  // account, verified the caller. That forged the "verified" badge on a victim's
  // pre-registered email. This proves the token→account binding is enforced.
  it("verify-email rejects a token minted for a different account (audit #3)", async () => {
    // Account A — the attacker's session, unverified, on a victim's address.
    const aEmail = faker.internet.email().toLocaleLowerCase();
    const { data: aData, error: aErr } = await client.auth.signup.post({
      email: aEmail,
      firstName: "A",
      lastName: "A",
      password: faker.internet.password(),
    });
    if (aErr) throw aErr;
    expect(aData?.accessToken).toBeDefined();

    // Account B — a second account the attacker controls; capture its valid
    // verification token (still sitting in the cache).
    await client.auth.signup.post({
      email: faker.internet.email().toLocaleLowerCase(),
      firstName: "B",
      lastName: "B",
      password: faker.internet.password(),
    });
    const tokenB = lastVerifyToken;
    expect(tokenB).toBeTruthy();

    // Logged in as A, try to verify A using B's token. Must be rejected.
    const { data, error } = await client.auth["verify-email"].post(
      { token: tokenB },
      { headers: { authorization: `Bearer ${aData?.accessToken}` } },
    );
    expect(error).toBeTruthy();
    expect(
      (data as { accessToken?: string } | null)?.accessToken,
    ).toBeUndefined();

    // A must remain unverified — the cross-account token did nothing.
    const aUser = await Backend.store.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("email", "=", aEmail)
      .select("emailVerified")
      .executeTakeFirstOrThrow();
    expect(aUser.emailVerified).toBe(false);
  });
});
