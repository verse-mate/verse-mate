import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia } from "elysia";

import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import coachData from "./coach.data.json";
import coachPlugin from "./coach.plugin";
import { type CoachDataset, CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const LEADER_EMAIL = "xacct-leader@example.test";
const MOVED_EMAIL = "xacct-moved@example.test";
const FORMER_ADMIN = "xacct-former-admin@example.test";
const SLUG = "xacct-leader";

const app = new Elysia().use(coachPlugin);
const store = app.store as unknown as { coachService: unknown };
const realService = store.coachService;
const tokens = new Map<string, string>();

async function account(email: string, emailVerified = true) {
  const id = (
    await conn
      .insertInto("user")
      .values({ email, firstName: "X", lastName: "A", emailVerified })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  const signer = new Elysia().use(
    jwt({
      name: "jwt",
      secret: process.env.AUTH_ACCESS_TOKEN_SECRET as string,
    }),
  );
  const token = await signer.decorator.jwt.sign({ sub: id });
  await redisClient.set(cacheConstants.accessToken(id), [token], "5m");
  await redisClient.delete(`rate-limit:coach:${id}`);
  tokens.set(id, token);
  return id;
}

async function get(path: string, userId: string) {
  const res = await app.handle(
    new Request(`http://localhost/coach/${path}`, {
      headers: { authorization: `Bearer ${tokens.get(userId)}` },
    }),
  );
  return res.status;
}

async function clear() {
  await conn.deleteFrom("coach_leaders").where("slug", "=", SLUG).execute();
  await conn
    .deleteFrom("coach_admins")
    .where("email", "=", FORMER_ADMIN)
    .execute();
  await conn
    .deleteFrom("user")
    .where("email", "in", [LEADER_EMAIL, MOVED_EMAIL, FORMER_ADMIN])
    .execute();
}

let original = "";
let newcomer = "";
let registrant = "";

beforeAll(async () => {
  await clear();
  await conn
    .insertInto("coach_leaders")
    .values({ slug: SLUG, email: LEADER_EMAIL, name: "Cross Account" })
    .execute();
  original = await account(LEADER_EMAIL);
  store.coachService = new CoachService(Database, undefined, {
    ...(coachData as unknown as CoachDataset),
    admins: [FORMER_ADMIN],
  });
});

afterAll(async () => {
  store.coachService = realService;
  for (const id of tokens.keys())
    await redisClient.set(cacheConstants.accessToken(id), [], "1s");
  await clear();
});

describe("the identity gate holds under a re-registration attempt (task 10.7)", () => {
  it("the leader who signs in first with the invited address is bound and sees their dashboard", async () => {
    expect(await get("me", original)).toBe(200);
    expect(await get("reports", original)).toBe(200);
  });

  it("after the bound leader moves to another address, a new account registered on the old address claims nothing", async () => {
    await conn
      .updateTable("user")
      .set({ email: MOVED_EMAIL })
      .where("id", "=", original)
      .execute();
    await conn
      .updateTable("user")
      .set({ emailVerified: true, email_verified_at: new Date() })
      .where("id", "=", original)
      .execute();
    newcomer = await account(LEADER_EMAIL);
    expect(await get("me", newcomer)).toBe(403);
    expect(await get("reports", newcomer)).toBe(403);
    expect(await get("trends", newcomer)).toBe(403);
    expect(await get("me", original)).toBe(200);
  });

  it("registering the former hardcoded admin address grants no admin capability", async () => {
    await conn
      .insertInto("coach_admins")
      .values({ email: FORMER_ADMIN })
      .execute();
    registrant = await account(FORMER_ADMIN, false);
    expect(await get("admin/coaches", registrant)).toBe(403);
    expect(await get("admin/pipeline-failures", registrant)).toBe(403);
    expect(await get("me", registrant)).toBe(403);
  });
});
