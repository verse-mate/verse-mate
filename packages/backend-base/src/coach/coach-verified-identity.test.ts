import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachIdentityService } from "./coach-identity.service";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const ADMIN = "verified-admin@example.test";
const LEADER = "verified-leader@example.test";

async function clear() {
  await conn.deleteFrom("coach_admins").where("email", "=", ADMIN).execute();
  await conn.deleteFrom("coach_leaders").where("email", "=", LEADER).execute();
  await conn.deleteFrom("user").where("email", "in", [ADMIN, LEADER]).execute();
}

async function account(email: string, emailVerified: boolean) {
  const row = await conn
    .insertInto("user")
    .values({ email, firstName: "V", lastName: "I", emailVerified })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

describe("coaching identity requires a verified email", () => {
  beforeEach(clear);
  afterEach(clear);

  it("an unverified account on a granted admin address holds no admin authority", async () => {
    await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
    const userId = await account(ADMIN, false);
    const service = new CoachService(Database);

    expect(await service.isAdmin(userId)).toBe(false);
    expect(await service.getMe(userId)).toBeNull();
  });

  it("a verified account the role is granted to is an admin", async () => {
    const userId = await account(ADMIN, true);
    expect(
      await new CoachIdentityService(Database, null).grantAdmin(ADMIN, null),
    ).toEqual({ ok: true });
    expect(await new CoachService(Database).isAdmin(userId)).toBe(true);
  });

  it("an unverified account on a roster address is not resolved to that leader", async () => {
    const inviter = await account(ADMIN, true);
    const added = await new CoachService(Database).addLeader(inviter, {
      email: LEADER,
      name: "Verified Leader",
    });
    expect(added.ok).toBe(true);
    const unverified = await account(LEADER, false);
    const service = new CoachService(Database);

    expect(await service.isCoach(unverified)).toBe(false);
    expect(await service.getReports(unverified)).toBeNull();

    await conn
      .updateTable("user")
      .set({ emailVerified: true })
      .where("id", "=", unverified)
      .execute();
    expect(await service.isCoach(unverified)).toBe(true);
  });
});

describe("stage 1: coaching identity needs a verified email on every path (task 10.5)", () => {
  beforeEach(clear);
  afterEach(clear);

  it("Unverified account matching a roster email: getMe answers with the non-coach gate, and the leader routes refuse it", async () => {
    const inviter = await account(ADMIN, true);
    await new CoachService(Database).addLeader(inviter, {
      email: LEADER,
      name: "Verified Leader",
    });
    const unverified = await account(LEADER, false);
    const service = new CoachService(Database);
    expect(await service.getMe(unverified)).toBeNull();
    expect(await service.leaderIdFor(unverified)).toBeNull();
    expect(await service.getTrends(unverified)).toBeNull();
    expect(await service.getMyMonthlySummary(unverified, "2026-09")).toBeNull();
  });

  it("Non-admin attempts an admin capability: an unverified account on an admin address is refused", async () => {
    await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
    const unverified = await account(ADMIN, false);
    const service = new CoachService(Database);
    expect(await service.isAdmin(unverified)).toBe(false);
    expect(await service.getMe(unverified)).toBeNull();
  });
});

describe("stage 2: coaching identity resolves by account binding (task 10.6)", () => {
  const OTHER = "verified-other@example.test";
  const MOVED = "verified-moved@example.test";
  beforeEach(async () => {
    await clear();
    await conn
      .deleteFrom("user")
      .where("email", "in", [OTHER, MOVED])
      .execute();
  });
  afterEach(async () => {
    await clear();
    await conn
      .deleteFrom("user")
      .where("email", "in", [OTHER, MOVED])
      .execute();
  });

  async function invite() {
    const inviter = await account(OTHER, true);
    await new CoachService(Database).addLeader(inviter, {
      email: LEADER,
      name: "Verified Leader",
    });
  }

  it("Leader signs in with the invited address: the first verified sign-in binds the record, and the dashboard is theirs", async () => {
    await invite();
    const leader = await account(LEADER, true);
    const service = new CoachService(Database);
    expect(await service.isCoach(leader)).toBe(true);
    const row = await conn
      .selectFrom("coach_leaders")
      .select("user_id")
      .where("email", "=", LEADER)
      .executeTakeFirstOrThrow();
    expect(row.user_id).toBe(leader);
  });

  it("Re-registered address cannot claim a record: the bound account keeps it after changing its own email, and a new account on the old address gets nothing", async () => {
    await invite();
    const original = await account(LEADER, true);
    const service = new CoachService(Database);
    expect(await service.isCoach(original)).toBe(true);
    await conn
      .updateTable("user")
      .set({ email: MOVED })
      .where("id", "=", original)
      .execute();
    const newcomer = await account(LEADER, true);
    expect(await service.isCoach(newcomer)).toBe(false);
    expect(await service.getMe(newcomer)).toBeNull();
    expect(await service.leaderIdFor(original)).not.toBeNull();
  });

  it("Registering the former admin email grants nothing: an admin row no account was ever bound to is inert", async () => {
    await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
    const registrant = await account(ADMIN, true);
    expect(await new CoachService(Database).isAdmin(registrant)).toBe(false);
  });

  it("an admin bound to an account keeps the role by account, not by address", async () => {
    const admin = await account(ADMIN, true);
    await conn
      .insertInto("coach_admins")
      .values({ email: ADMIN, user_id: admin })
      .execute();
    const service = new CoachService(Database);
    expect(await service.isAdmin(admin)).toBe(true);
    await conn
      .updateTable("user")
      .set({ email: MOVED })
      .where("id", "=", admin)
      .execute();
    expect(await service.isAdmin(admin)).toBe(true);
    const registrant = await account(ADMIN, true);
    expect(await service.isAdmin(registrant)).toBe(false);
  });
});
