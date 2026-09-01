import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachDeliveryService, reportSubject } from "./coach-delivery.service";
import type { ReportEvidence } from "./coach-governance.service";

const conn = Database.getOrCreateConnection();
const LEADER = "deliv-leader";
const BENCH = "deliv-bench";
const EMAILS = [
  "deliv-leader@example.test",
  "deliv-bench@example.test",
  "deliv-admin@example.test",
];

interface Sent {
  to: string;
  subject: string;
  replyTo?: string;
}

class FakeMailer {
  sent: Sent[] = [];
  constructor(private readonly fail: (to: string) => boolean = () => false) {}
  async sendEmail(data: {
    subject: string;
    to: { name: string; email: string };
    replyTo?: { name: string; email: string };
  }) {
    this.sent.push({
      to: data.to.email,
      subject: data.subject,
      replyTo: data.replyTo?.email,
    });
    return this.fail(data.to.email)
      ? { delivered: false, error: "rejected" }
      : { delivered: true };
  }
}

function evidence(
  quotes: string[] = [],
  timestamps: string[] = [],
): ReportEvidence {
  return { quotes, timestamps };
}

async function seedLeaders() {
  await conn
    .insertInto("coach_leaders")
    .values([
      { slug: LEADER, email: EMAILS[0], name: "Jeff Ward" },
      {
        slug: BENCH,
        email: EMAILS[1],
        name: "Bryan Bailey",
        is_benchmark: true,
      },
    ])
    .execute();
  await conn.insertInto("coach_admins").values({ email: EMAILS[2] }).execute();
}

async function seedReport(
  id: string,
  coachId = LEADER,
  body: Record<string, unknown> = { feedback: { headline: "solid session" } },
) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: coachId,
      session_date: "2026-08-22",
      source_session_id: `ff-${id}`,
      legacy_ids: [],
      summary: { session: "Obadiah", score: 78, status: "Strong" },
      metrics: {},
      body,
    })
    .execute();
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: `ff-${id}`,
      coach_id: coachId,
      title: "Obadiah",
      session_date: "2026-08-22",
      state: "scored",
      report_id: id,
    })
    .execute();
}

async function clear() {
  for (const c of [LEADER, BENCH]) {
    await conn
      .deleteFrom("coach_intake_sessions")
      .where("coach_id", "=", c)
      .execute();
    await conn.deleteFrom("coach_reports").where("coach_id", "=", c).execute();
  }
  await conn.deleteFrom("coach_leaders").where("email", "in", EMAILS).execute();
  await conn.deleteFrom("coach_admins").where("email", "in", EMAILS).execute();
}

describe("the subject is derived, not invented", () => {
  it("carries the date, the leader and the recorded session title", () => {
    // The old convention used the leader-authored EMAIL subject, which no
    // longer exists once the email path is dropped.
    expect(
      reportSubject({
        sessionDate: "2026-08-22",
        leaderName: "Jeff Ward",
        sessionTitle: "Obadiah, Lesson 4",
      }),
    ).toBe("Coaching report — 2026-08-22 — Jeff Ward — Obadiah, Lesson 4");
  });

  it("sanitizes a title carrying newlines or runs of whitespace", () => {
    expect(
      reportSubject({
        sessionDate: "2026-08-22",
        leaderName: "Jeff Ward",
        sessionTitle: "Obadiah\n\tLesson   4  ",
      }),
    ).toBe("Coaching report — 2026-08-22 — Jeff Ward — Obadiah Lesson 4");
  });
});

describe("delivery", () => {
  beforeEach(async () => {
    await clear();
    await seedLeaders();
  });
  afterEach(clear);

  it("sends to the leader, the benchmark leader and the program admin", async () => {
    await seedReport("r1");
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(["a fresh quote"]),
    });

    expect(result.delivered).toBe(true);
    // Derived, not hardcoded: the rule is the leader, the benchmark leader and
    // EVERY program admin — and migration 5 seeds a real one, so a fixture-only
    // expectation would have been wrong about the rule while looking right.
    const admins = await conn
      .selectFrom("coach_admins")
      .select("email")
      .execute();
    const expected = new Set([
      EMAILS[0],
      EMAILS[1],
      ...admins.map((a) => a.email),
    ]);
    expect(new Set(mailer.sent.map((s) => s.to))).toEqual(expected);
    expect(mailer.sent.length).toBe(expected.size);
  });

  it("the SAME subject goes to all three, so replies stay one thread", async () => {
    await seedReport("r1");
    const mailer = new FakeMailer();
    await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    expect(new Set(mailer.sent.map((s) => s.subject)).size).toBe(1);
  });

  it("sets Reply-To, because From must be the authenticated domain", async () => {
    await seedReport("r1");
    const mailer = new FakeMailer();
    await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    expect(mailer.sent.every((s) => Boolean(s.replyTo))).toBe(true);
  });

  it("nobody is mailed twice when one person holds two roles", async () => {
    // The benchmark leader is often also an admin.
    await conn
      .insertInto("coach_admins")
      .values({ email: EMAILS[1] })
      .execute();
    await seedReport("r1");
    const mailer = new FakeMailer();
    await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    expect(mailer.sent.length).toBe(new Set(mailer.sent.map((s) => s.to)).size);
  });

  it("delivery is NOT complete when one recipient's send fails", async () => {
    // Reporting a partial delivery as success is how an admin stops seeing a
    // leader's reports without anyone noticing.
    await seedReport("r1");
    const mailer = new FakeMailer((to) => to === EMAILS[2]);
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(false);
    expect(result.refusal).toBe("send-failed");
    expect(result.sends?.find((s) => s.email === EMAILS[2])?.delivered).toBe(
      false,
    );
  });

  it("a failed delivery does NOT mark the session delivered", async () => {
    await seedReport("r1");
    const mailer = new FakeMailer(() => true);
    await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("report_id", "=", "r1")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("scored");
  });

  it("refuses to send a report that is not live on the portal", async () => {
    // An email whose link 404s is worse than no email: the leader is told a
    // report exists and cannot read it.
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "never-created",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(false);
    expect(mailer.sent.length).toBe(0);
  });

  it("a governance violation BLOCKS the send and is not discarded", async () => {
    await seedReport("r1", LEADER, {
      feedback: { headline: "Not yet at Bryan Bailey's level" },
    });
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(false);
    expect(result.refusal).toBe("governance-blocked");
    expect(result.violations?.[0].rule).toBe("benchmark-name");
    expect(mailer.sent.length).toBe(0);
    // The report still exists, for the admin review path to pick up.
    const still = await conn
      .selectFrom("coach_reports")
      .select("id")
      .where("id", "=", "r1")
      .executeTakeFirst();
    expect(still?.id).toBe("r1");
  });

  it("TWO SAME-CYCLE reports sharing a quote: the second is blocked", async () => {
    // Delivery is serialized per leader, so "earlier" has a meaning even when
    // both reports are produced in one poll cycle. Without it each would see
    // the other as not yet existing and both would ship the same quote.
    await seedReport("r1");
    await seedReport("r2");
    const mailer = new FakeMailer();
    const svc = new CoachDeliveryService(Database, mailer);

    const [a, b] = await Promise.all([
      svc.deliver({ reportId: "r1", evidence: evidence(["the shared line"]) }),
      svc.deliver({ reportId: "r2", evidence: evidence(["the shared line"]) }),
    ]);

    const delivered = [a, b].filter((r) => r.delivered);
    const blocked = [a, b].filter((r) => r.refusal === "governance-blocked");
    expect(delivered.length).toBe(1);
    expect(blocked.length).toBe(1);
    expect(blocked[0].violations?.[0].rule).toBe("reused-quote");
  });

  it("a delivered report's evidence joins the comparison set", async () => {
    await seedReport("r1");
    const mailer = new FakeMailer();
    await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(["recorded line"]),
    });
    const row = await conn
      .selectFrom("coach_reports")
      .select("evidence")
      .where("id", "=", "r1")
      .executeTakeFirstOrThrow();
    expect((row.evidence as ReportEvidence).quotes).toEqual(["recorded line"]);
  });

  it("a report that passes both checks is delivered and marked so", async () => {
    await seedReport("r1");
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(["all new"], ["00:05:00"]),
    });
    expect(result.delivered).toBe(true);
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("report_id", "=", "r1")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("delivered");
  });
});
