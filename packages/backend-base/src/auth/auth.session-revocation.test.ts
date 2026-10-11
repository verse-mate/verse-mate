import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";
import { Elysia } from "elysia";

import biblePlugin from "../bible/bible.plugin";
import cacheConstants from "../shared/cache.constants";
import { getTestClient } from "../shared/test-client";
import authPlugin from "./auth.plugin";

const app = new Elysia().use(authPlugin).use(biblePlugin);
const client = getTestClient<typeof app>(app);
const conn = authPlugin.store.db.getOrCreateConnection();
const cache = authPlugin.store.cache;
const PASSWORD = "Revoke1234";
let created: string[] = [];

afterEach(async () => {
  if (created.length > 0)
    await conn.deleteFrom("user").where("id", "in", created).execute();
  created = [];
});

async function account() {
  const email = `revoke-${faker.string.uuid()}@example.test`;
  const { id } = await conn
    .insertInto("user")
    .values({
      email,
      firstName: "R",
      lastName: "S",
      emailVerified: true,
      password: await Bun.password.hash(PASSWORD, {
        algorithm: "bcrypt",
        cost: 4,
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  created.push(id);
  return { id, email };
}

async function signIn(email: string) {
  const { data, error } = await client.auth.login.post({
    email,
    password: PASSWORD,
  });
  if (error || !data) throw error ?? new Error("login failed");
  return data.accessToken;
}

const bearer = (token: string) => ({
  headers: { authorization: `Bearer ${token}` },
});

async function accepted(token: string) {
  const guarded = await client.auth.session.get(bearer(token));
  const introduction = client.bible.book({ bookId: 1 }).introduction;
  const sessionOnly = await introduction["mark-viewed"].post({}, bearer(token));
  const byQuery = await introduction["mark-viewed"].post(
    {},
    { query: { accessToken: token } },
  );
  return {
    guarded: guarded.status,
    sessionOnly: sessionOnly.status,
    byQuery: byQuery.status,
  };
}

const ACCEPTED = { guarded: 200, sessionOnly: 200, byQuery: 200 };
const REFUSED = { guarded: 401, sessionOnly: 401, byQuery: 401 };

describe("a signed-out access token is refused everywhere until it expires", () => {
  it("logout refuses that session's token and keeps a session signed in the same second", async () => {
    const { email } = await account();
    const [kept, loggedOut] = await Promise.all([signIn(email), signIn(email)]);

    const { data } = await client.auth.logout.post({}, bearer(loggedOut));

    expect(data).toBe(true);
    expect(await accepted(loggedOut)).toEqual(REFUSED);
    expect(await accepted(kept)).toEqual(ACCEPTED);
  });

  it("a sign-in that started before a logout does not bring the logged-out token back", async () => {
    const { id, email } = await account();
    const loggedOut = await signIn(email);
    const key = cacheConstants.accessToken(id);
    let armed = true;
    const logout = () => client.auth.logout.post({}, bearer(loggedOut));
    const realGet = cache.get.bind(cache);
    const realAppend = cache.appendToJsonArray.bind(cache);
    const staleRead = spyOn(cache, "get").mockImplementation(
      async (k: string) => {
        const value = await realGet(k);
        if (armed && k === key) {
          armed = false;
          await logout();
        }
        return value as any;
      },
    );
    const interleaved = spyOn(cache, "appendToJsonArray").mockImplementation(
      async (k, value, ttl, limit) => {
        if (armed && k === key) {
          armed = false;
          await logout();
        }
        return realAppend(k, value, ttl, limit);
      },
    );
    let fresh: string;
    try {
      fresh = await signIn(email);
    } finally {
      staleRead.mockRestore();
      interleaved.mockRestore();
    }

    expect(armed).toBe(false);
    expect(await accepted(loggedOut)).toEqual(REFUSED);
    expect(await accepted(fresh)).toEqual(ACCEPTED);
  });

  it("logout-all refuses every token of the account", async () => {
    const { email } = await account();
    const first = await signIn(email);
    const second = await signIn(email);

    await client.auth["logout-all"].post({}, bearer(first));

    expect(await accepted(first)).toEqual(REFUSED);
    expect(await accepted(second)).toEqual(REFUSED);
  });

  it("a password change refuses every token issued before it", async () => {
    const { email } = await account();
    const first = await signIn(email);
    const second = await signIn(email);

    const { data } = await client.auth["change-password"].post(
      { currentPassword: PASSWORD, password: "Changed1234" },
      bearer(first),
    );

    expect(data).toBe(true);
    expect(await accepted(first)).toEqual(REFUSED);
    expect(await accepted(second)).toEqual(REFUSED);
  });

  it("an account deletion refuses every token of the account", async () => {
    const { id, email } = await account();
    const first = await signIn(email);
    const second = await signIn(email);
    await cache.delete(`rate-limit:delete-account:${id}`);

    const { data } = await client.auth.account.delete(
      { password: PASSWORD },
      bearer(first),
    );

    expect(data?.success).toBe(true);
    expect(await accepted(first)).toEqual(REFUSED);
    expect(await accepted(second)).toEqual(REFUSED);
  });
});
