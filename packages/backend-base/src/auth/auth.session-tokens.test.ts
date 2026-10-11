import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";
import { faker } from "@faker-js/faker";

import cacheConstants from "../shared/cache.constants";
import { signupPassword } from "../shared/signup-password";
import { getTestClient } from "../shared/test-client";
import Backend, { type AuthPlugin } from "./auth.plugin";

describe("Auth - session tokens", () => {
  const client = getTestClient<AuthPlugin>(Backend);
  const db = Backend.store.db.getOrCreateConnection();

  afterEach(() => {
    setSystemTime();
  });

  const emails: string[] = [];

  afterAll(async () => {
    if (!emails.length) return;
    const users = await db
      .selectFrom("user")
      .select("id")
      .where("email", "in", emails)
      .execute();
    for (const { id } of users)
      await Backend.store.cache.delete(cacheConstants.accessToken(id));
    await db.deleteFrom("user").where("email", "in", emails).execute();
  });

  const accountWithPassword = async () => {
    const email = faker.internet.email().toLowerCase();
    const password = signupPassword();
    emails.push(email);
    await db
      .insertInto("user")
      .values({
        email,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        password: await Bun.password.hash(password, {
          algorithm: "bcrypt",
          cost: 4,
        }),
        emailVerified: true,
        email_verified_at: new Date(),
      })
      .execute();
    return { email, password };
  };

  it("two sign-ins in the same second get different tokens, and signing out one keeps the other", async () => {
    const account = await accountWithPassword();
    setSystemTime(new Date("2026-01-01T12:00:00.000Z"));

    const first = await client.auth.login.post(account);
    const second = await client.auth.login.post(account);
    if (first.error) throw first.error;
    if (second.error) throw second.error;

    expect(first.data.accessToken).not.toBe(second.data.accessToken);

    const signedOut = await client.auth.logout.post(
      {},
      { headers: { authorization: `Bearer ${first.data.accessToken}` } },
    );
    expect(signedOut.error).toBeFalsy();

    const signedOutSession = await client.auth.user.get({
      headers: { authorization: `Bearer ${first.data.accessToken}` },
    });
    expect(signedOutSession.status).toBe(401);

    const stillSignedIn = await client.auth.user.get({
      headers: { authorization: `Bearer ${second.data.accessToken}` },
    });
    expect(stillSignedIn.error).toBeFalsy();
    expect(stillSignedIn.data?.id).toBeTruthy();
  });
});
