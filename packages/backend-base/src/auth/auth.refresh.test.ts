import { describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";
import { getTestClient } from "../shared/test-client";
import Backend, { type AuthPlugin } from "./auth.plugin";
import cacheConstants from "../shared/cache.constants";

describe("Auth Refresh Flow", () => {
  const client = getTestClient<AuthPlugin>(Backend);
  const cacheService = Backend.store.cache;

  const authSignupInput = {
    email: faker.internet.email().toLocaleLowerCase(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    password: faker.internet.password(),
  };

  let authPayload: any;
  let userId: string;

  it("Setup: Signup and Login", async () => {
    // 1. Signup
    let token = "";
    spyOn(Backend.store.notification, "sendEmail").mockImplementationOnce(
      (message) => {
        token = message.text.split("?key=").at(-1) ?? "";
        return Promise.resolve();
      },
    );

    const { data: signupData, error: signupError } = await client.auth.signup.post(authSignupInput);
    if (signupError) throw signupError;

    // 2. Verify Email
    const { data: verifyData, error: verifyError } = await client.auth["verify-email"].post(
      { token },
      { headers: { authorization: `Bearer ${signupData?.accessToken}` } }
    );
    if (verifyError) throw verifyError;
    authPayload = verifyData;

    // 3. Get User ID
    const { data: userData, error: userError } = await client.auth.user.get({
      headers: { authorization: `Bearer ${authPayload.accessToken}` },
    });
    if (userError) throw userError;
    userId = userData?.id ?? "";
    expect(userId).toBeTruthy();
  });

  it("Simulate Access Token Expiry and Refresh", async () => {
    // 1. Verify Access Token works initially
    const { error: initialError } = await client.auth.user.get({
      headers: { authorization: `Bearer ${authPayload.accessToken}` },
    });
    expect(initialError).toBeFalsy();

    // 2. Simulate Expiry: Delete Access Token from Redis
    // (This simulates the 15m TTL expiring, or Redis eviction)
    await cacheService.delete(cacheConstants.accessToken(userId));

    // 3. Verify Access Token FAILS (401)
    const { error: expiredError } = await client.auth.user.get({
      headers: { authorization: `Bearer ${authPayload.accessToken}` },
    });
    expect(expiredError).toBeTruthy();
    expect((expiredError as any)?.status).toBe(401);

    // 4. Call Refresh Endpoint
    const { data: refreshData, error: refreshError } = await client.auth.refresh.post({
      refreshToken: authPayload.refreshToken,
    });

    if (refreshError) {
      console.error("Refresh Error:", JSON.stringify(refreshError, null, 2));
    }
    expect(refreshError).toBeFalsy();
    expect(refreshData?.accessToken).toBeDefined();
    expect(refreshData?.accessToken).not.toBe(authPayload.accessToken);

    // 5. Verify NEW Access Token works
    const { error: newError } = await client.auth.user.get({
      headers: { authorization: `Bearer ${refreshData?.accessToken}` },
    });
    expect(newError).toBeFalsy();

    // 6. Verify OLD Access Token STILL fails (it shouldn't be re-added)
    const { error: oldError } = await client.auth.user.get({
      headers: { authorization: `Bearer ${authPayload.accessToken}` },
    });
    expect(oldError).toBeTruthy();
  });
});
