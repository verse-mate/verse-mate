import { describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";

import cacheConstants from "../shared/cache.constants";
import { getTestClient } from "../shared/test-client";
import Backend, { type AuthPlugin } from "./auth.plugin";
import type { AuthPayload } from "./entities/auth.entity";

describe("Auth", () => {
  const client = getTestClient<AuthPlugin>(Backend);

  let signupAuthPayload: AuthPayload | null;
  let loginAuthPayload: AuthPayload | null;

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
        return Promise.resolve();
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
    if (verifyError) throw verifyError;

    expect(verifyEmailData?.accessToken).toBeDefined();
    signupAuthPayload = verifyEmailData;

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
  });

  it("Logout", async () => {
    // It should have 2 sessions
    const cacheService = Backend.store.cache;

    const { data, error } = await client.auth.user.get({
      headers: {
        authorization: `Bearer ${signupAuthPayload?.accessToken}`,
      },
    });
    if (error) throw error;
    expect(data?.id).toBeTruthy();
    if (!data?.id) {
      return;
    }

    let tokens =
      (await cacheService.get<string[]>(cacheConstants.accessToken(data.id))) ??
      [];
    expect(tokens).toHaveLength(4);

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
    expect(tokens).toHaveLength(3);

    const { data: logoutLogin } = await client.auth.logout.post(
      {},
      {
        headers: {
          authorization: `Bearer ${loginAuthPayload?.accessToken}`,
        },
      },
    );
    expect(logoutLogin).toBeTruthy();

    tokens =
      (await cacheService.get<string[]>(cacheConstants.accessToken(data.id))) ??
      [];
    expect(tokens).toHaveLength(2);
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
    expect(data?.id).toBeTruthy();
    if (!data?.id) {
      return;
    }

    let tokens =
      (await cacheService.get<string[]>(cacheConstants.accessToken(data.id))) ??
      [];
    expect(tokens).toHaveLength(3);

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
        return Promise.resolve();
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
