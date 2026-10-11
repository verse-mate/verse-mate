import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import userPlugin from "../user/user.plugin";
import cacheConstants from "./cache.constants";
import shared from "./shared.plugin";

const conn = shared.store.db.getOrCreateConnection();
const cache = shared.store.cache;

let userId: string;
let token: string;

function me(options: { query?: string; authorization?: string } = {}) {
  return userPlugin.handle(
    new Request(`http://localhost/user/me${options.query ?? ""}`, {
      headers: options.authorization
        ? { authorization: options.authorization }
        : undefined,
    }),
  );
}

beforeAll(async () => {
  const user = await conn
    .insertInto("user")
    .values({
      email: `bearer-${faker.string.uuid()}@example.test`,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      emailVerified: true,
      password: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  userId = user.id;
  token = await (shared as any).decorator.jwt.sign({ sub: userId });
  await cache.set(cacheConstants.accessToken(userId), [token], "15m");
});

afterAll(async () => {
  await cache.delete(cacheConstants.accessToken(userId));
  await conn.deleteFrom("user").where("id", "=", userId).execute();
});

describe("access token transport on a guarded route", () => {
  it("accepts the token in the Authorization header", async () => {
    const response = await me({ authorization: `Bearer ${token}` });
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(userId);
  });

  it.each(["access_token", "accessToken"])(
    "refuses the token in the %s query parameter",
    async (name) => {
      const response = await me({
        query: `?${name}=${encodeURIComponent(token)}`,
      });
      expect(response.status).toBe(401);
    },
  );

  it.each([
    ["a lowercase scheme", () => `bearer ${token}`],
    ["a scheme with no token", () => "Bearer"],
    ["a scheme with an empty token", () => "Bearer "],
    ["another scheme", () => `Basic ${token}`],
    ["two spaces after the scheme", () => `Bearer  ${token}`],
  ])("refuses %s", async (_label, header) => {
    const response = await me({ authorization: header() });
    expect(response.status).toBe(401);
  });

  it("uses the header when a query token is also sent", async () => {
    const response = await me({
      query: "?access_token=not-a-token",
      authorization: `Bearer ${token}`,
    });
    expect(response.status).toBe(200);
  });
});
