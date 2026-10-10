import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { clearUnprovenRosterConfirmations } from "database/migrations/20260901167000-coach-confirmation-cleared-where-unproven";

import { CoachIdentityService } from "./coach-identity.service";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const ADMIN = "verified-admin@example.test";
const LEADER = "verified-leader@example.test";

async function clear() {
  await conn.deleteFrom("coach_admins").where("email", "=", ADMIN).execute();
  await conn.deleteFrom("coach_leaders").where("email", "=", LEADER).execute();
  await conn
    .deleteFrom("user")
    .where("email", "in", [ADMIN, LEADER, LEADER.toUpperCase()])
    .execute();
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

  it("Registering the former admin email grants nothing: registering the address without confirming it claims no admin row", async () => {
    await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
    const registrant = await account(ADMIN, false);
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

describe("the first visit after an account is confirmed", () => {
  beforeEach(clear);
  afterEach(clear);

  it("several coach requests at once all resolve the leader, not only the one that claimed the record", async () => {
    await conn
      .insertInto("coach_leaders")
      .values({ slug: "verified-race", email: LEADER, name: "Race Leader" })
      .execute();
    const userId = await account(LEADER, true);
    const ids = await Promise.all(
      Array.from({ length: 30 }, () =>
        new CoachService(Database).leaderIdFor(userId),
      ),
    );
    expect(ids).toEqual(Array(30).fill("verified-race"));
  });
});

describe("the identity migration asks roster and admin addresses to confirm again (owner, option A)", () => {
  const STRANGER = "verified-stranger@example.test";
  beforeEach(async () => {
    await clear();
    await conn.deleteFrom("user").where("email", "=", STRANGER).execute();
  });
  afterEach(async () => {
    await clear();
    await conn.deleteFrom("user").where("email", "=", STRANGER).execute();
  });

  it("binds nothing when it runs", async () => {
    await conn
      .insertInto("coach_leaders")
      .values({ slug: "verified-mig", email: LEADER, name: "Mig Leader" })
      .execute();
    await account(LEADER, true);
    await clearUnprovenRosterConfirmations(
      Database.getOrCreateConnection() as never,
    );
    expect(
      (
        await conn
          .selectFrom("coach_leaders")
          .select("user_id")
          .where("slug", "=", "verified-mig")
          .executeTakeFirstOrThrow()
      ).user_id,
    ).toBeNull();
  });

  it("an admin row binds to the account that confirms its address and signs in, and only that account", async () => {
    await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
    const userId = await account(ADMIN, true);
    const service = new CoachService(Database);
    const answers = await Promise.all(
      Array.from({ length: 10 }, () =>
        new CoachService(Database).isAdmin(userId),
      ),
    );
    expect(answers).toEqual(Array(10).fill(true));
    expect(
      (
        await conn
          .selectFrom("coach_admins")
          .select("user_id")
          .where("email", "=", ADMIN)
          .executeTakeFirstOrThrow()
      ).user_id,
    ).toBe(userId);
    await conn
      .updateTable("user")
      .set({ email: STRANGER })
      .where("id", "=", userId)
      .execute();
    const newcomer = await account(ADMIN, true);
    expect(await service.isAdmin(newcomer)).toBe(false);
  });

  it("an unconfirmed account on an admin address claims nothing", async () => {
    await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
    const userId = await account(ADMIN, false);
    expect(await new CoachService(Database).isAdmin(userId)).toBe(false);
    expect(
      (
        await conn
          .selectFrom("coach_admins")
          .select("user_id")
          .where("email", "=", ADMIN)
          .executeTakeFirstOrThrow()
      ).user_id,
    ).toBeNull();
  });
});

describe("only a confirmation made from this deploy on binds, whatever order the roster arrives in", () => {
  beforeEach(clear);
  afterEach(clear);

  async function confirmedBeforeDeploy(email: string) {
    const id = await account(email, true);
    await conn
      .updateTable("user")
      .set({ email_verified_at: null })
      .where("id", "=", id)
      .execute();
    return id;
  }

  it("an account confirmed before the deploy, on a leader address the roster gains afterwards, claims nothing until it confirms again", async () => {
    const userId = await confirmedBeforeDeploy(LEADER);
    await conn
      .insertInto("coach_leaders")
      .values({ slug: "verified-late", email: LEADER, name: "Late Leader" })
      .execute();
    const service = new CoachService(Database);
    expect(await service.leaderIdFor(userId)).toBeNull();
    expect(await service.needsEmailConfirmation(userId)).toBe(true);
    await conn
      .updateTable("user")
      .set({ emailVerified: true })
      .where("id", "=", userId)
      .execute();
    expect(await service.leaderIdFor(userId)).toBe("verified-late");
    expect(await service.needsEmailConfirmation(userId)).toBe(false);
  });

  it("the same holds for an admin row, an invite binding and a grant", async () => {
    await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
    const admin = await confirmedBeforeDeploy(ADMIN);
    expect(await new CoachService(Database).isAdmin(admin)).toBe(false);
    expect(
      await new CoachIdentityService(Database, null).grantAdmin(ADMIN, null),
    ).toEqual({ ok: false, refusal: "no-verified-account" });
    const invitee = await confirmedBeforeDeploy(LEADER);
    const inviter = await account("verified-inviter@example.test", true);
    try {
      await new CoachService(Database).addLeader(inviter, {
        email: LEADER,
        name: "Invited Late",
      });
      expect(
        (
          await conn
            .selectFrom("coach_leaders")
            .select("user_id")
            .where("email", "=", LEADER)
            .executeTakeFirstOrThrow()
        ).user_id,
      ).toBeNull();
      expect(invitee).toBeTruthy();
    } finally {
      await conn
        .deleteFrom("user")
        .where("email", "=", "verified-inviter@example.test")
        .execute();
    }
  });

  it("a new confirmation stamps the time, and changing the address clears it", async () => {
    const id = await account(LEADER, false);
    await conn
      .updateTable("user")
      .set({ emailVerified: true })
      .where("id", "=", id)
      .execute();
    const stamped = await conn
      .selectFrom("user")
      .select("email_verified_at")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(stamped.email_verified_at).not.toBeNull();
    await conn
      .updateTable("user")
      .set({ emailVerified: false })
      .where("id", "=", id)
      .execute();
    expect(
      (
        await conn
          .selectFrom("user")
          .select("email_verified_at")
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
      ).email_verified_at,
    ).toBeNull();
  });
});

describe("a confirmation is cleared only where a rename could have put it", () => {
  const STRANGER = "verified-stranger@example.test";
  const OTHER = "verified-other@example.test";
  const wipe = async () => {
    await clear();
    await conn
      .deleteFrom("coach_leaders")
      .where("slug", "=", "verified-rule")
      .execute();
    await conn.deleteFrom("user").where("email", "=", STRANGER).execute();
  };
  beforeEach(wipe);
  afterEach(wipe);

  async function confirmedBeforeDeploy(
    email: string,
    opts: { password?: boolean; links?: string[] } = {},
  ) {
    const { id } = await conn
      .insertInto("user")
      .values({
        email,
        firstName: "V",
        lastName: "I",
        emailVerified: true,
        password: opts.password === false ? null : "hash",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await conn
      .updateTable("user")
      .set({ email_verified_at: null })
      .where("id", "=", id)
      .execute();
    for (const [i, linkEmail] of (opts.links ?? []).entries())
      await conn
        .insertInto("user_sso_accounts")
        .values({
          user_id: id,
          provider: (i === 0 ? "google" : "apple") as never,
          provider_user_id: `${id}-${i}`,
          email: linkEmail,
        })
        .execute();
    return id;
  }

  async function confirmed(id: string) {
    return (
      await conn
        .selectFrom("user")
        .select("emailVerified")
        .where("id", "=", id)
        .executeTakeFirstOrThrow()
    ).emailVerified;
  }

  const addLeader = (email = LEADER) =>
    conn
      .insertInto("coach_leaders")
      .values({ slug: "verified-rule", email, name: "Rule Leader" })
      .execute();

  it("A password account on a roster address: cleared when the address joins the roster", async () => {
    const id = await confirmedBeforeDeploy(LEADER);
    await addLeader();
    expect(await confirmed(id)).toBe(false);
  });

  it("a password account that also has a Google link for its own address is still cleared", async () => {
    const id = await confirmedBeforeDeploy(LEADER, { links: [LEADER] });
    await addLeader();
    expect(await confirmed(id)).toBe(false);
  });

  it("A Google-only account on its own address: kept, whatever the case of either address", async () => {
    const id = await confirmedBeforeDeploy(LEADER.toUpperCase(), {
      password: false,
      links: [LEADER, ` ${LEADER} `],
    });
    await addLeader();
    expect(await confirmed(id)).toBe(true);
  });

  it("An account renamed into a roster address: cleared, its link was made for another address", async () => {
    const id = await confirmedBeforeDeploy(LEADER, {
      password: false,
      links: [OTHER],
    });
    await addLeader();
    expect(await confirmed(id)).toBe(false);
  });

  it("an account with no password and no link is cleared", async () => {
    const id = await confirmedBeforeDeploy(LEADER, { password: false });
    await addLeader();
    expect(await confirmed(id)).toBe(false);
  });

  it("An account confirmed after the deploy: kept when an admin adds its address", async () => {
    const id = await account(LEADER, true);
    await addLeader();
    expect(await confirmed(id)).toBe(true);
  });

  it("an address joining the admin list, or a leader's address changing to it, clears the same way", async () => {
    const admin = await confirmedBeforeDeploy(ADMIN);
    await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
    expect(await confirmed(admin)).toBe(false);

    const renamed = await confirmedBeforeDeploy(LEADER);
    await addLeader("verified-placeholder@needs-real-email.invalid");
    expect(await confirmed(renamed)).toBe(true);
    await conn
      .updateTable("coach_leaders")
      .set({ email: LEADER })
      .where("slug", "=", "verified-rule")
      .execute();
    expect(await confirmed(renamed)).toBe(false);
  });

  it("A stranger's account: an address on neither list is never touched, and the deploy sweep covers rows already listed", async () => {
    const stranger = await confirmedBeforeDeploy(STRANGER);
    await addLeader();
    const late = await confirmedBeforeDeploy(LEADER);
    expect(await confirmed(late)).toBe(true);
    await clearUnprovenRosterConfirmations(
      Database.getOrCreateConnection() as never,
    );
    expect(await confirmed(late)).toBe(false);
    expect(await confirmed(stranger)).toBe(true);
  });
});
