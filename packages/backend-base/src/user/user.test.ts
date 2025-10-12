import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";

import authPlugin from "../auth/auth.plugin";
import { getTestClient } from "../shared/test-client";
import Backend from "./user.plugin";

describe("User", () => {
  let accessToken: string;
  const authSignupInput = {
    email: faker.internet.email().toLocaleLowerCase(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    password: faker.internet.password(),
  };
  const plugin = Backend.use(authPlugin);
  // @ts-ignore - TODO: Fix this
  const testClient = getTestClient<typeof plugin>(plugin);

  beforeAll(async () => {
    const { data, error } = await testClient.auth.signup.post(authSignupInput);
    if (error) throw error;

    accessToken = data?.accessToken ?? "";
  });

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  it("get user profile", async () => {
    const { data } = await testClient.user.me.get({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (data instanceof Error) return;

    expect(data?.email).toBe(authSignupInput.email);
    expect(data?.firstName).toBe(authSignupInput.firstName);
    expect(data?.lastName).toBe(authSignupInput.lastName);
  });

  it("update", async () => {
    const updateData = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    };
    const { data } = await testClient.user.update.post(updateData, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(data).toBe(true);
  });
});
