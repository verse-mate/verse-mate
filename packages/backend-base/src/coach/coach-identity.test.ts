import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachIdentityService } from "./coach-identity.service";

const conn = Database.getOrCreateConnection();
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
      { kind: "admin", id: null, email: ADMIN, account: "none" },
      {
        kind: "leader",
        id: "id-none",
        email: EMAIL("id-none"),
        account: "none",
      },
      {
        kind: "leader",
        id: "id-unverified",
        email: EMAIL("id-unverified"),
        account: "unverified",
      },
      {
        kind: "leader",
        id: "id-verified",
        email: EMAIL("id-verified"),
        account: "verified",
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
