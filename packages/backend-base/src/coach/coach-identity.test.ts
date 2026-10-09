import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachIdentityService } from "./coach-identity.service";
import { isolateTable } from "./coach-test-tables";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
isolateTable("coach_admins");
const LEADERS = ["id-none", "id-unverified", "id-verified"];
const ADMIN = "id-admin@example.test";
const EMAIL = (slug: string) => `${slug}@example.test`;

async function clear() {
  await conn.deleteFrom("coach_admins").where("email", "=", ADMIN).execute();
  await conn.deleteFrom("coach_leaders").where("slug", "in", LEADERS).execute();
  await conn
    .deleteFrom("user")
    .where("email", "in", [...LEADERS.map(EMAIL), ADMIN])
    .execute();
}

async function account(email: string, emailVerified: boolean) {
  return (
    await conn
      .insertInto("user")
      .values({ email, firstName: "I", lastName: "D", emailVerified })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

beforeEach(async () => {
  await clear();
  await conn
    .insertInto("coach_leaders")
    .values(LEADERS.map((slug) => ({ slug, email: EMAIL(slug), name: slug })))
    .execute();
  await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
  await account(EMAIL("id-unverified"), false);
  await account(EMAIL("id-verified"), true);
});
afterEach(clear);

describe("coaching identity preparation (tasks 10.1, 10.2)", () => {
  it("10.1: the audit lists every roster leader and admin whose email is unclaimed or unverified", async () => {
    const audit = await new CoachIdentityService(Database, null).audit();
    const ours = audit.entries.filter(
      (e) => LEADERS.includes(e.id ?? "") || e.email === ADMIN,
    );
    expect(ours).toEqual([
      { kind: "admin", id: null, email: ADMIN, account: "none", bound: false },
      {
        kind: "leader",
        id: "id-none",
        email: EMAIL("id-none"),
        account: "none",
        bound: false,
      },
      {
        kind: "leader",
        id: "id-unverified",
        email: EMAIL("id-unverified"),
        account: "unverified",
        bound: false,
      },
      {
        kind: "leader",
        id: "id-verified",
        email: EMAIL("id-verified"),
        account: "verified",
        bound: false,
      },
    ]);
    expect(audit.atRisk).toBeGreaterThanOrEqual(3);
  });
});

describe("verification nudges (task 10.2)", () => {
  class Mailer {
    sent: Array<{ to: string; subject: string; html: string }> = [];
    async sendEmail(data: {
      to: { email: string };
      subject: string;
      html?: string;
    }) {
      this.sent.push({
        to: data.to.email,
        subject: data.subject,
        html: data.html ?? "",
      });
      return { delivered: true };
    }
  }

  it("leaders with no account or an unverified one are nudged to the portal; verified leaders and placeholder addresses are not", async () => {
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: "id-placeholder",
        email: "id-placeholder@needs-real-email.invalid",
        name: "P",
      })
      .execute();
    try {
      const mailer = new Mailer();
      const result = await new CoachIdentityService(
        Database,
        mailer as never,
      ).nudge();
      const to = mailer.sent.map((s) => s.to);
      expect(to).toContain(EMAIL("id-none"));
      expect(to).toContain(EMAIL("id-unverified"));
      expect(to).not.toContain(EMAIL("id-verified"));
      expect(to).not.toContain("id-placeholder@needs-real-email.invalid");
      expect(result.skipped).toContain(
        "id-placeholder@needs-real-email.invalid",
      );
      const unverified = mailer.sent.find(
        (s) => s.to === EMAIL("id-unverified"),
      );
      expect(unverified?.subject).toBe(
        "Confirm your email to see your coaching reports",
      );
      expect(unverified?.html).toContain("/coach");
      const none = mailer.sent.find((s) => s.to === EMAIL("id-none"));
      expect(none?.subject).toBe(
        "Create your VerseMate account to see your coaching reports",
      );
    } finally {
      await conn
        .deleteFrom("coach_leaders")
        .where("slug", "=", "id-placeholder")
        .execute();
    }
  });

  it("with no mailer, nothing is claimed sent", async () => {
    expect(
      await new CoachIdentityService(Database, null).nudge(),
    ).toMatchObject({
      sent: [],
      refusal: "no-mailer",
    });
  });
});

describe("binding coaching records and the admin role to accounts (task 10.4)", () => {
  const ids = new CoachIdentityService(Database, null);

  async function userId(email: string) {
    return (
      await conn
        .selectFrom("user")
        .select("id")
        .where("email", "=", email)
        .executeTakeFirstOrThrow()
    ).id;
  }

  it("Admin role is granted and revoked without a deploy, bound to the verified account that holds the address", async () => {
    const granted = await ids.grantAdmin(EMAIL("id-verified"), null);
    expect(granted).toEqual({ ok: true });
    const row = await conn
      .selectFrom("coach_admins")
      .select(["user_id"])
      .where("email", "=", EMAIL("id-verified"))
      .executeTakeFirstOrThrow();
    expect(row.user_id).toBe(await userId(EMAIL("id-verified")));
    expect((await ids.listAdmins()).map((a) => a.email)).toContain(
      EMAIL("id-verified"),
    );
    expect(await ids.revokeAdmin(EMAIL("id-verified"))).toEqual({ ok: true });
    expect((await ids.listAdmins()).map((a) => a.email)).not.toContain(
      EMAIL("id-verified"),
    );
  });

  it("a grant needs a verified account on the address", async () => {
    expect(await ids.grantAdmin(EMAIL("id-unverified"), null)).toEqual({
      ok: false,
      refusal: "no-verified-account",
    });
    expect(await ids.grantAdmin(EMAIL("id-none"), null)).toEqual({
      ok: false,
      refusal: "no-verified-account",
    });
  });

  it("the last admin cannot be revoked, and an unknown address is refused", async () => {
    await conn.deleteFrom("coach_admins").where("email", "!=", ADMIN).execute();
    expect(await ids.revokeAdmin(ADMIN)).toEqual({
      ok: false,
      refusal: "last-admin",
    });
    expect(await ids.revokeAdmin("nobody@example.test")).toEqual({
      ok: false,
      refusal: "unknown-admin",
    });
  });

  it("a leader invited on an address a verified account holds is bound to it at invite time", async () => {
    const inviter = await userId(EMAIL("id-verified"));
    const email = "id-invited@example.test";
    const invitee = await account(email, true);
    try {
      const added = await new CoachService(Database).addLeader(inviter, {
        email,
        name: "Invited Leader",
      });
      expect(added.ok).toBe(true);
      const row = await conn
        .selectFrom("coach_leaders")
        .select("user_id")
        .where("email", "=", email)
        .executeTakeFirstOrThrow();
      expect(row.user_id).toBe(invitee);
      expect(
        (await ids.audit()).entries.find((e) => e.email === email),
      ).toMatchObject({ account: "verified", bound: true });
    } finally {
      await conn
        .deleteFrom("coach_leaders")
        .where("email", "=", email)
        .execute();
      await conn.deleteFrom("user").where("email", "=", email).execute();
    }
  });
});
