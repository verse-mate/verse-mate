import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

import { reattributeSession } from "./coach-attribution";
import { recordCalibration } from "./coach-calibration";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import {
  CoachDeliveryService,
  DELIVERY_ATTEMPT_LIMIT,
  isPlaceholderAddress,
  reportSubject,
} from "./coach-delivery.service";
import type { ReportEvidence } from "./coach-governance.service";
import { CoachReviewService } from "./coach-review.service";
import { isolateTable } from "./coach-test-tables";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
isolateTable("coach_admins");

beforeAll(() => {
  process.env[COACH_PIPELINE_LIVE] = "true";
});
afterAll(() => {
  delete process.env[COACH_PIPELINE_LIVE];
});
const LEADER = "deliv-leader";
const BENCH = "deliv-bench";
const EMAILS = [
  "deliv-leader@example.test",
  "deliv-bench@example.test",
  "deliv-admin@example.test",
];
const PLACEHOLDER = "deliv-leader@needs-real-email.invalid";

interface Sent {
  to: string;
  toName: string;
  subject: string;
  replyTo?: string;
  text: string;
  html: string;
}

class FakeMailer {
  sent: Sent[] = [];
  constructor(private readonly fail: (to: string) => boolean = () => false) {}
  async sendEmail(data: {
    subject: string;
    to: { name: string; email: string };
    replyTo?: { name: string; email: string };
    // Captured, not discarded. The body is what the requirement is ABOUT
    // ("delivery carries the portal link"), and no test could see it.
    text?: string;
    html?: string;
  }) {
    this.sent.push({
      to: data.to.email,
      toName: data.to.name,
      subject: data.subject,
      replyTo: data.replyTo?.email,
      text: data.text ?? "",
      html: data.html ?? "",
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
      { slug: LEADER, email: EMAILS[0], name: "Milo Kerr" },
      {
        slug: BENCH,
        email: EMAILS[1],
        name: "Avery Hollis",
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
        leaderName: "Milo Kerr",
        sessionTitle: "Obadiah, Lesson 4",
      }),
    ).toBe("Coaching report — 2026-08-22 — Milo Kerr — Obadiah, Lesson 4");
  });

  it("sanitizes a title carrying newlines or runs of whitespace", () => {
    expect(
      reportSubject({
        sessionDate: "2026-08-22",
        leaderName: "Milo Kerr",
        sessionTitle: "Obadiah\n\tLesson   4  ",
      }),
    ).toBe("Coaching report — 2026-08-22 — Milo Kerr — Obadiah Lesson 4");
  });
});

describe("a placeholder address is recognised however it is written", () => {
  it.each([
    "x@needs-real-email.invalid",
    " X@NEEDS-REAL-EMAIL.INVALID ",
    "x@needs-real-email.invalid.",
  ])("%p is a placeholder", (address) => {
    expect(isPlaceholderAddress(address)).toBe(true);
  });

  it("a real address is not", () => {
    expect(isPlaceholderAddress("x@invalid.example.org")).toBe(false);
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
    expect(mailer.sent.map((s) => s.to).sort()).toEqual([...EMAILS].sort());
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

  it("a report emailed to some recipients is open to its leader even when another send failed", async () => {
    await seedReport("r1");
    await conn
      .updateTable("coach_reports")
      .set({ held: true })
      .where("id", "=", "r1")
      .execute();
    const mailer = new FakeMailer((to) => to === EMAILS[2]);
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    expect(result.refusal).toBe("send-failed");
    expect(mailer.sent.some((s) => s.to === EMAILS[0])).toBe(true);
    expect(
      await new CoachService(Database).getReportDetail(LEADER, "r1", "leader"),
    ).not.toBeNull();
  });

  it("a report blocked by governance stays hidden from its leader", async () => {
    await seedReport("r1", LEADER, {
      feedback: { headline: "Not yet at Avery Hollis's level" },
    });
    await conn
      .updateTable("coach_reports")
      .set({ held: true })
      .where("id", "=", "r1")
      .execute();
    const result = await new CoachDeliveryService(
      Database,
      new FakeMailer(),
    ).deliver({ reportId: "r1", evidence: evidence() });
    expect(result.refusal).toBe("governance-blocked");
    expect(
      await new CoachService(Database).getReportDetail(LEADER, "r1", "leader"),
    ).toBeNull();
  });

  it("a failed delivery leaves the session retryable, with the attempt counted", async () => {
    await seedReport("r1");
    const mailer = new FakeMailer(() => true);
    await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["state", "retry_count"])
      .where("report_id", "=", "r1")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ state: "delivery_pending", retry_count: 1 });
  });

  it("the failed send that reaches the cap moves the session to delivery_failed", async () => {
    await seedReport("r1");
    await conn
      .updateTable("coach_intake_sessions")
      .set({
        state: "delivery_pending",
        retry_count: DELIVERY_ATTEMPT_LIMIT - 1,
      })
      .where("report_id", "=", "r1")
      .execute();
    await new CoachDeliveryService(
      Database,
      new FakeMailer(() => true),
    ).deliver({ reportId: "r1", evidence: evidence() });
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["state", "retry_count"])
      .where("report_id", "=", "r1")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      state: "delivery_failed",
      retry_count: DELIVERY_ATTEMPT_LIMIT,
    });
  });

  it("a mailer that throws is a failed send, not a lost session", async () => {
    await seedReport("r1");
    const result = await new CoachDeliveryService(Database, {
      sendEmail: async () => {
        throw new Error("mailgun down");
      },
    } as any).deliver({ reportId: "r1", evidence: evidence() });
    expect(result.refusal).toBe("send-failed");
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("report_id", "=", "r1")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("delivery_pending");
  });

  it("a report id nobody holds is an unknown report", async () => {
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "never-created",
      evidence: evidence(),
    });
    // Named, not just falsy: this was the only case that ever reached the
    // refusal path, so asserting only "not delivered" proved nothing about
    // WHICH refusal fired.
    expect(result.refusal).toBe("unknown-report");
    expect(mailer.sent.length).toBe(0);
  });

  it("does NOT mail a second copy of a report already delivered", async () => {
    // The pipeline runs on a schedule. Anything that re-enters it for a
    // session already reported (a retry, a re-score, a session row that did
    // not advance) mailed all three recipients again.
    await seedReport("r-twice", LEADER);
    const mailer = new FakeMailer();
    const svc = new CoachDeliveryService(Database, mailer);

    const first = await svc.deliver({
      reportId: "r-twice",
      evidence: evidence(),
    });
    expect(first.delivered).toBe(true);
    // The recipient set is whatever the roster holds, so the count that
    // matters is how many MORE arrive on the second call.
    const afterFirst = mailer.sent.length;
    expect(afterFirst).toBeGreaterThanOrEqual(3);

    const second = await svc.deliver({
      reportId: "r-twice",
      evidence: evidence(["a different quote"]),
    });
    expect(second.refusal).toBe("already-delivered");
    expect(mailer.sent.length).toBe(afterFirst);
  });

  it("a governance violation BLOCKS the send and is not discarded", async () => {
    await seedReport("r1", LEADER, {
      feedback: { headline: "Not yet at Avery Hollis's level" },
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

  it("TWO SAME-CYCLE reports sharing a quote: the second is blocked, naming the first", async () => {
    await seedReport("r1");
    await seedReport("r2");
    const mailer = new FakeMailer();
    const svc = new CoachDeliveryService(Database, mailer);

    const [a, b] = await Promise.all([
      svc.deliver({ reportId: "r1", evidence: evidence(["the shared line"]) }),
      svc.deliver({ reportId: "r2", evidence: evidence(["the shared line"]) }),
    ]);

    expect([a, b].filter((r) => r.delivered).length).toBe(1);
    const [first, later] = a.delivered ? ["r1", "r2"] : ["r2", "r1"];
    const loser = a.delivered ? b : a;
    expect(["in-flight", "governance-blocked"]).toContain(loser.refusal);
    const blocked =
      loser.refusal === "governance-blocked"
        ? loser
        : await svc.deliver({
            reportId: later,
            evidence: evidence(["the shared line"]),
          });
    expect(blocked.refusal).toBe("governance-blocked");
    expect(blocked.violations?.[0].rule).toBe("reused-quote");
    expect(blocked.violations?.[0].detail).toContain(first);
  });

  it("a recipient holding two roles under differently cased addresses is mailed once", async () => {
    const shouted = EMAILS[0].toUpperCase();
    await conn
      .updateTable("coach_leaders")
      .set({ email: shouted })
      .where("slug", "=", LEADER)
      .execute();
    await conn
      .insertInto("coach_admins")
      .values({ email: EMAILS[0] })
      .execute();
    try {
      await seedReport("r-cased");
      const mailer = new FakeMailer();
      const result = await new CoachDeliveryService(Database, mailer).deliver({
        reportId: "r-cased",
        evidence: evidence(),
      });
      expect(result.delivered).toBe(true);
      expect(
        mailer.sent.filter((s) => s.to.toLowerCase() === EMAILS[0]),
      ).toHaveLength(1);
    } finally {
      await conn
        .deleteFrom("coach_admins")
        .where("email", "=", EMAILS[0])
        .execute();
      await conn
        .updateTable("coach_leaders")
        .set({ email: EMAILS[0] })
        .where("slug", "=", LEADER)
        .execute();
    }
  });

  it("the leader is addressed by name, not by slug", async () => {
    await seedReport("r-named");
    const mailer = new FakeMailer();
    await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r-named",
      evidence: evidence(),
    });
    expect(mailer.sent.find((s) => s.to === EMAILS[0])?.toName).toBe(
      "Milo Kerr",
    );
  });

  it("the leader is read from the report after the claim, so a report moved just before its claim goes to its new leader", async () => {
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: "deliv-moved",
        email: "deliv-moved@example.test",
        name: "Moira Moved",
      })
      .execute();
    try {
      await seedReport("r-moved");
      const mailer = new FakeMailer();
      const svc = new CoachDeliveryService(Database, mailer);
      const internals = svc as unknown as {
        claim: (id: string) => Promise<unknown>;
      };
      const claim = internals.claim.bind(svc);
      internals.claim = async (id: string) => {
        await conn
          .updateTable("coach_reports")
          .set({ coach_id: "deliv-moved" })
          .where("id", "=", id)
          .execute();
        await conn
          .updateTable("coach_intake_sessions")
          .set({ coach_id: "deliv-moved" })
          .where("report_id", "=", id)
          .execute();
        return claim(id);
      };
      const result = await svc.deliver({
        reportId: "r-moved",
        evidence: evidence(),
      });
      expect(result.delivered).toBe(true);
      const tos = mailer.sent.map((s) => s.to);
      expect(tos).toContain("deliv-moved@example.test");
      expect(tos).not.toContain(EMAILS[0]);
      expect(result.subject).toContain("Moira Moved");
    } finally {
      await conn
        .deleteFrom("coach_intake_sessions")
        .where("report_id", "=", "r-moved")
        .execute();
      await conn
        .deleteFrom("coach_reports")
        .where("id", "=", "r-moved")
        .execute();
      await conn
        .deleteFrom("coach_leaders")
        .where("slug", "=", "deliv-moved")
        .execute();
    }
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

  async function storedEvidenceOf(reportId: string) {
    return (
      await conn
        .selectFrom("coach_reports")
        .select("evidence")
        .where("id", "=", reportId)
        .executeTakeFirstOrThrow()
    ).evidence as ReportEvidence | null;
  }

  it("a report delivered to only some recipients still blocks a later report reusing its quote, naming it", async () => {
    await seedReport("r-partial");
    await seedReport("r-later");
    const partial = await new CoachDeliveryService(
      Database,
      new FakeMailer((to) => to === EMAILS[2]),
    ).deliver({
      reportId: "r-partial",
      evidence: evidence(["a line the leader said once"], ["12:34"]),
    });
    expect(partial.refusal).toBe("send-failed");
    expect(await storedEvidenceOf("r-partial")).toEqual(
      evidence(["a line the leader said once"], ["12:34"]),
    );

    const mailer = new FakeMailer();
    const later = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r-later",
      evidence: evidence(["a line the leader said once"], ["12:34"]),
    });
    expect(later.refusal).toBe("governance-blocked");
    expect(later.violations?.map((v) => v.rule)).toEqual([
      "reused-quote",
      "reused-timestamp",
    ]);
    for (const v of later.violations ?? [])
      expect(v.detail).toContain("r-partial");
    expect(mailer.sent).toEqual([]);
  });

  it("an attempt that reaches nobody leaves no evidence behind to block a later report", async () => {
    await seedReport("r-nobody");
    await seedReport("r-next");
    const failed = await new CoachDeliveryService(
      Database,
      new FakeMailer(() => true),
    ).deliver({
      reportId: "r-nobody",
      evidence: evidence(["a line nobody ever received"]),
    });
    expect(failed.refusal).toBe("send-failed");
    expect(await storedEvidenceOf("r-nobody")).toBeNull();

    const next = await new CoachDeliveryService(
      Database,
      new FakeMailer(),
    ).deliver({
      reportId: "r-next",
      evidence: evidence(["a line nobody ever received"]),
    });
    expect(next.delivered).toBe(true);
  });

  it("a correction clears evidence left by an attempt that sent nothing", async () => {
    await seedReport("r-corrected");
    await conn
      .insertInto("coach_report_dimension_scores")
      .values({
        report_id: "r-corrected",
        dimension_n: 1,
        score: 4,
        rationale: 'said "a line from before the correction" at 10:10',
        provenance: "machine",
      })
      .execute();
    await conn
      .updateTable("coach_reports")
      .set({
        evidence: JSON.stringify(
          evidence(["a line from before the correction"], ["10:10"]),
        ),
      })
      .where("id", "=", "r-corrected")
      .execute();
    const corrected = await new CoachReviewService(Database).correct({
      reportId: "r-corrected",
      dimensionN: 1,
      score: 3,
      rationale: "admin: reworded",
      correctedByUserId: null,
    });
    expect(corrected.ok).toBe(true);
    expect(await storedEvidenceOf("r-corrected")).toBeNull();
  });

  it("the email CARRIES the portal link, in both the html and the text part", async () => {
    // The requirement is "delivery carries a prominent link to the report on
    // the live portal". The mailer double used to discard text and html, so
    // nothing could see whether the link was there at all.
    await seedReport("r-link", LEADER);
    const mailer = new FakeMailer();
    await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r-link",
      evidence: evidence(),
    });

    expect(mailer.sent.length).toBeGreaterThan(0);
    for (const sent of mailer.sent) {
      expect(sent.text).toContain("/coach");
      expect(sent.text).toContain("r-link");
      // A link element, not a bare URL pasted into the prose.
      expect(sent.html).toMatch(/<a[^>]+href="[^"]*r-link/);
    }
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

describe("delivery is claimed in the database, so separate workers cannot both send", () => {
  beforeEach(async () => {
    await clear();
    await seedLeaders();
  });
  afterEach(clear);

  it("two workers delivering the same report send it once", async () => {
    await seedReport("r-race");
    const mailer = new FakeMailer();
    const [a, b] = await Promise.all([
      new CoachDeliveryService(Database, mailer).deliver({
        reportId: "r-race",
        evidence: evidence(),
      }),
      new CoachDeliveryService(Database, mailer).deliver({
        reportId: "r-race",
        evidence: evidence(),
      }),
    ]);
    expect([a, b].filter((r) => r.delivered).length).toBe(1);
    expect(mailer.sent.length).toBe(new Set(mailer.sent.map((s) => s.to)).size);
  });

  it("two workers delivering two reports that share a quote do not both ship it", async () => {
    await seedReport("r-q1");
    await seedReport("r-q2");
    const mailer = new FakeMailer();
    const results = await Promise.all([
      new CoachDeliveryService(Database, mailer).deliver({
        reportId: "r-q1",
        evidence: evidence(["the shared line across workers"]),
      }),
      new CoachDeliveryService(Database, mailer).deliver({
        reportId: "r-q2",
        evidence: evidence(["the shared line across workers"]),
      }),
    ]);
    expect(results.filter((r) => r.delivered).length).toBe(1);

    const loser = results[0].delivered ? "r-q2" : "r-q1";
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("report_id", "=", loser)
      .executeTakeFirstOrThrow();
    expect(["delivery_pending", "scored"]).toContain(row.state);

    const retry = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: loser,
      evidence: evidence(["the shared line across workers"]),
    });
    expect(retry.refusal).toBe("governance-blocked");
    expect(retry.violations?.[0].rule).toBe("reused-quote");
  });

  it("a report another worker is delivering is refused and left for a later tick", async () => {
    await seedReport("r-busy-1");
    await seedReport("r-busy-2");
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivering" })
      .where("report_id", "=", "r-busy-1")
      .execute();
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r-busy-2",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(false);
    expect(mailer.sent).toEqual([]);
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("report_id", "=", "r-busy-2")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("delivery_pending");
  });

  it("a governance block releases the claim back to the review path", async () => {
    await seedReport("r-blocked", LEADER, {
      feedback: { headline: "Not yet at Avery Hollis's level" },
    });
    const result = await new CoachDeliveryService(
      Database,
      new FakeMailer(),
    ).deliver({ reportId: "r-blocked", evidence: evidence() });
    expect(result.refusal).toBe("governance-blocked");
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("report_id", "=", "r-blocked")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("scored");
  });

  it("a report whose live claim another worker holds is refused as in flight, nothing is mailed and the claim is untouched", async () => {
    await seedReport("r-live-claim");
    const held = await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivering", updated_at: sql`clock_timestamp()` })
      .where("report_id", "=", "r-live-claim")
      .returning(sql<string>`updated_at::text`.as("token"))
      .executeTakeFirstOrThrow();
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r-live-claim",
      evidence: evidence(),
    });
    expect(result).toEqual({ delivered: false, refusal: "in-flight" });
    expect(mailer.sent).toEqual([]);
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["state", sql<string>`updated_at::text`.as("token")])
      .where("report_id", "=", "r-live-claim")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ state: "delivering", token: held.token });
  });

  it("a claim abandoned by a crashed worker is taken over once it is stale", async () => {
    await seedReport("r-stale");
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivering", updated_at: sql`NOW() - interval '1 day'` })
      .where("report_id", "=", "r-stale")
      .execute();
    const result = await new CoachDeliveryService(
      Database,
      new FakeMailer(),
    ).deliver({ reportId: "r-stale", evidence: evidence() });
    expect(result.delivered).toBe(true);
  });
});

describe("a slow send cannot turn into a second copy", () => {
  beforeEach(async () => {
    await clear();
    await seedLeaders();
  });
  afterEach(clear);

  function receivedBy(...mailers: FakeMailer[]) {
    const counts = new Map<string, number>();
    for (const m of mailers)
      for (const s of m.sent) counts.set(s.to, (counts.get(s.to) ?? 0) + 1);
    return counts;
  }

  async function sessionState(id: string) {
    return (
      await conn
        .selectFrom("coach_intake_sessions")
        .select("state")
        .where("report_id", "=", id)
        .executeTakeFirstOrThrow()
    ).state;
  }

  it("a worker that stalls past the claim window is fenced off, no send repeats, and its late confirmation still counts", async () => {
    await seedReport("r-stall");
    const rescuer = new FakeMailer();
    let rescued: Promise<unknown> | null = null;
    class StallingMailer extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        const result = await super.sendEmail(data);
        if (this.sent.length === 2 && rescued === null) {
          await conn
            .updateTable("coach_intake_sessions")
            .set({ updated_at: sql`NOW() - interval '20 minutes'` })
            .where("report_id", "=", "r-stall")
            .execute();
          rescued = new CoachDeliveryService(Database, rescuer).deliver({
            reportId: "r-stall",
            evidence: evidence(),
          });
          await rescued;
        }
        return result;
      }
    }
    const stalled = new StallingMailer();
    const first = await new CoachDeliveryService(Database, stalled).deliver({
      reportId: "r-stall",
      evidence: evidence(),
    });

    expect(first.delivered).toBe(false);
    expect(first.refusal).toBe("in-flight");
    const received = receivedBy(stalled, rescuer);
    for (const email of EMAILS) expect(received.has(email)).toBe(true);
    for (const [, n] of received) expect(n).toBe(1);

    const last = new FakeMailer();
    const settled = await new CoachDeliveryService(Database, last).deliver({
      reportId: "r-stall",
      evidence: evidence(),
    });
    expect(settled.delivered).toBe(true);
    expect(last.sent).toEqual([]);
    expect(await sessionState("r-stall")).toBe("delivered");
  });

  it("a stalled worker whose last sends failed after another worker took the claim leaves that live claim as it is", async () => {
    await seedReport("r-stall-fail");
    const total = EMAILS.length;
    const mailer = new FakeMailer((to) => to === EMAILS[2]);
    const service = new CoachDeliveryService(Database, mailer);
    const internals = service as unknown as {
      clearAttempt: (...args: unknown[]) => Promise<boolean>;
    };
    const clearAttempt = internals.clearAttempt.bind(service);
    let takenOver: string | null = null;
    internals.clearAttempt = async (...args: unknown[]) => {
      const cleared = await clearAttempt(...args);
      if (mailer.sent.length === total) {
        const taken = await conn
          .updateTable("coach_intake_sessions")
          .set({ updated_at: sql`clock_timestamp() + interval '1 second'` })
          .where("report_id", "=", "r-stall-fail")
          .returning(sql<string>`updated_at::text`.as("token"))
          .executeTakeFirstOrThrow();
        takenOver = taken.token;
      }
      return cleared;
    };
    await service.deliver({ reportId: "r-stall-fail", evidence: evidence() });
    expect(takenOver).not.toBeNull();
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select([
        "state",
        "retry_count",
        "hold_kind",
        "hold_reason",
        sql<string>`updated_at::text`.as("token"),
      ])
      .where("report_id", "=", "r-stall-fail")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      state: "delivering",
      retry_count: 0,
      hold_kind: null,
      hold_reason: null,
      token: takenOver as unknown as string,
    });
  });

  it("a stalled worker's failed send cannot clear the attempt the worker now holding the claim recorded", async () => {
    await seedReport("r-clear-fenced");
    let takenOver: string | null = null;
    class TakenDuringFailedSend extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        const result = await super.sendEmail(data);
        const taken = await conn
          .updateTable("coach_intake_sessions")
          .set({
            updated_at: sql`clock_timestamp() + interval '1 second'`,
            attempted_to: sql`ARRAY[${EMAILS[0]}]::text[]`,
          })
          .where("report_id", "=", "r-clear-fenced")
          .returning(sql<string>`updated_at::text`.as("token"))
          .executeTakeFirstOrThrow();
        takenOver = taken.token;
        return result;
      }
    }
    const result = await new CoachDeliveryService(
      Database,
      new TakenDuringFailedSend((to) => to === EMAILS[0]),
    ).deliver({ reportId: "r-clear-fenced", evidence: evidence() });
    expect(result.refusal).toBe("in-flight");
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select([
        "state",
        "attempted_to",
        sql<string>`updated_at::text`.as("token"),
      ])
      .where("report_id", "=", "r-clear-fenced")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      state: "delivering",
      attempted_to: [EMAILS[0]],
      token: takenOver as unknown as string,
    });
  });

  it("a worker whose claim was taken after its last send was recorded does not mark the report delivered", async () => {
    await seedReport("r-final-fenced");
    const service = new CoachDeliveryService(Database, new FakeMailer());
    const internals = service as unknown as {
      recipients: (...args: unknown[]) => Promise<{ recipients: unknown[] }>;
      recordRecipient: (...args: unknown[]) => Promise<boolean>;
    };
    const recipients = internals.recipients.bind(service);
    let total = 0;
    internals.recipients = async (...args: unknown[]) => {
      const found = await recipients(...args);
      total = found.recipients.length;
      return found;
    };
    const recordRecipient = internals.recordRecipient.bind(service);
    let recorded = 0;
    let takenOver: string | null = null;
    internals.recordRecipient = async (...args: unknown[]) => {
      const ok = await recordRecipient(...args);
      recorded += 1;
      if (recorded === total) {
        const taken = await conn
          .updateTable("coach_intake_sessions")
          .set({ updated_at: sql`clock_timestamp() + interval '1 second'` })
          .where("report_id", "=", "r-final-fenced")
          .returning(sql<string>`updated_at::text`.as("token"))
          .executeTakeFirstOrThrow();
        takenOver = taken.token;
      }
      return ok;
    };
    const result = await service.deliver({
      reportId: "r-final-fenced",
      evidence: evidence(),
    });
    expect(takenOver).not.toBeNull();
    expect(result.delivered).toBe(false);
    expect(result.refusal).toBe("in-flight");
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["state", sql<string>`updated_at::text`.as("token")])
      .where("report_id", "=", "r-final-fenced")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      state: "delivering",
      token: takenOver as unknown as string,
    });
  });

  it("a send confirmed after the claim was taken over and the session re-assigned records no recipient", async () => {
    await seedReport("r-reassigned");
    class HangingMailer extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        const result = await super.sendEmail(data);
        if (this.sent.length === 1) {
          await conn
            .updateTable("coach_intake_sessions")
            .set({ updated_at: sql`NOW() - interval '20 minutes'` })
            .where("report_id", "=", "r-reassigned")
            .execute();
          const takeover = await new CoachDeliveryService(
            Database,
            new FakeMailer(() => true),
          ).deliver({ reportId: "r-reassigned", evidence: evidence() });
          expect(takeover.refusal).toBe("send-failed");
          const moved = await reattributeSession(
            Database,
            "ff-r-reassigned",
            BENCH,
            LEADER,
          );
          expect(moved.ok).toBe(true);
        }
        return result;
      }
    }
    const first = await new CoachDeliveryService(
      Database,
      new HangingMailer(),
    ).deliver({ reportId: "r-reassigned", evidence: evidence() });
    expect(first.delivered).toBe(false);
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .innerJoin(
        "coach_reports",
        "coach_reports.id",
        "coach_intake_sessions.report_id",
      )
      .select(["state", "delivered_to", "held"])
      .where("report_id", "=", "r-reassigned")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ state: "retained", delivered_to: [], held: true });
  });

  it("a worker whose claim was taken before it sent neither mails nor opens the report", async () => {
    await seedReport("r-taken");
    await conn
      .updateTable("coach_reports")
      .set({ held: true })
      .where("id", "=", "r-taken")
      .execute();
    const mailer = new FakeMailer();
    const service = new CoachDeliveryService(Database, mailer);
    const internals = service as unknown as {
      recipients: (...args: unknown[]) => Promise<unknown>;
    };
    const recipients = internals.recipients.bind(service);
    internals.recipients = async (...args: unknown[]) => {
      await conn
        .updateTable("coach_intake_sessions")
        .set({ updated_at: sql`clock_timestamp() + interval '1 second'` })
        .where("report_id", "=", "r-taken")
        .execute();
      return recipients(...args);
    };
    const result = await service.deliver({
      reportId: "r-taken",
      evidence: evidence(),
    });
    expect(result.refusal).toBe("in-flight");
    expect(mailer.sent).toEqual([]);
    const report = await conn
      .selectFrom("coach_reports")
      .select("held")
      .where("id", "=", "r-taken")
      .executeTakeFirstOrThrow();
    expect(report.held).toBe(true);
  });

  it("a report corrected just before the claim is mailed as corrected", async () => {
    await seedReport("r-corrected");
    const mailer = new FakeMailer();
    const service = new CoachDeliveryService(Database, mailer);
    const internals = service as unknown as {
      claim: (reportId: string) => Promise<unknown>;
    };
    const claim = internals.claim.bind(service);
    internals.claim = async (reportId: string) => {
      await conn
        .updateTable("coach_reports")
        .set({ summary: { session: "Obadiah", score: 41, status: "Weak" } })
        .where("id", "=", reportId)
        .execute();
      return claim(reportId);
    };
    const result = await service.deliver({
      reportId: "r-corrected",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(true);
    expect(mailer.sent[0].html).toContain("41");
    expect(mailer.sent[0].html).not.toContain("78");
  });

  it("a retry after one recipient failed mails only the recipients still owed", async () => {
    await seedReport("r-partial");
    const flaky = new FakeMailer((to) => to === EMAILS[2]);
    const failed = await new CoachDeliveryService(Database, flaky).deliver({
      reportId: "r-partial",
      evidence: evidence(),
    });
    expect(failed.delivered).toBe(false);
    expect(await sessionState("r-partial")).toBe("delivery_pending");

    const retry = new FakeMailer();
    const result = await new CoachDeliveryService(Database, retry).deliver({
      reportId: "r-partial",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(true);
    expect(retry.sent.map((s) => s.to)).toEqual([EMAILS[2]]);
    expect(await sessionState("r-partial")).toBe("delivered");
  });

  it("a report re-published during the last send is not marked delivered by the stale worker", async () => {
    await seedReport("r-republished");
    const recipients = EMAILS.length;
    class RepublishOnLastSend extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        const result = await super.sendEmail(data);
        if (this.sent.length === recipients) {
          await conn
            .updateTable("coach_intake_sessions")
            .set({ state: "scored", updated_at: sql`NOW()` })
            .where("report_id", "=", "r-republished")
            .execute();
        }
        return result;
      }
    }
    const result = await new CoachDeliveryService(
      Database,
      new RepublishOnLastSend(),
    ).deliver({ reportId: "r-republished", evidence: evidence() });
    expect(result.delivered).toBe(false);
    expect(await sessionState("r-republished")).toBe("scored");
  });
});

describe("a model-produced report waits for its model version to be calibrated", () => {
  const VERSION = "v-test-calibration";
  const runs: number[] = [];

  async function modelScored(id: string) {
    await seedReport(id);
    await conn
      .insertInto("coach_report_dimension_scores")
      .values({
        report_id: id,
        dimension_n: 1,
        score: 4,
        rationale: "a reason",
        provenance: "machine",
        model_version: VERSION,
      })
      .execute();
  }

  async function record(compositeMae: number, dimensionsWithinOne: number) {
    runs.push(
      await recordCalibration(Database, VERSION, {
        overall: {
          compositeMae,
          dimensionsWithinOne,
          comparisons: 660,
          reports: 60,
        },
        perLeader: new Map(
          Array.from({ length: 10 }, (_, i) => [
            `calibrated-${i}`,
            { compositeMae, dimensionsWithinOne, comparisons: 66, reports: 6 },
          ]),
        ),
      }),
    );
  }

  beforeEach(async () => {
    await clear();
    await seedLeaders();
  });
  afterEach(async () => {
    await clear();
    if (runs.length > 0) {
      await conn
        .deleteFrom("coach_calibration_runs")
        .where("id", "in", runs.splice(0))
        .execute();
    }
  });

  it("an uncalibrated model version blocks delivery and says so", async () => {
    await modelScored("r-cal");
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r-cal",
      evidence: evidence(),
    });
    expect(result.refusal).toBe("calibration-blocked");
    expect(result.shortfalls?.join(" ")).toContain(VERSION);
    expect(mailer.sent).toEqual([]);
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["state", "retry_count"])
      .where("report_id", "=", "r-cal")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ state: "delivery_pending", retry_count: 0 });
  });

  it("a held report is listed for an admin with the shortfall that holds it", async () => {
    await modelScored("r-cal");
    await record(9, 0.95);
    await new CoachDeliveryService(Database, new FakeMailer()).deliver({
      reportId: "r-cal",
      evidence: evidence(),
    });
    const { sessions: failures } = await new CoachService(
      Database,
    ).listPipelineFailures();
    const held = failures.find((f) => f.reportId === "r-cal");
    expect(held?.state).toBe("delivery_pending");
    expect(held?.reason).toContain("calibration");
    expect(held?.reason).toContain(VERSION);
    expect(held?.reason).toContain("composite MAE");
  });

  it("the hold reason is cleared once the report goes out", async () => {
    await modelScored("r-cal");
    await new CoachDeliveryService(Database, new FakeMailer()).deliver({
      reportId: "r-cal",
      evidence: evidence(),
    });
    await record(3, 0.95);
    const result = await new CoachDeliveryService(
      Database,
      new FakeMailer(),
    ).deliver({ reportId: "r-cal", evidence: evidence() });
    expect(result.delivered).toBe(true);
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("hold_reason")
      .where("report_id", "=", "r-cal")
      .executeTakeFirstOrThrow();
    expect(row.hold_reason).toBeNull();
  });

  it("agreement outside tolerance blocks delivery with the shortfall named", async () => {
    await modelScored("r-cal");
    await record(9, 0.95);
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r-cal",
      evidence: evidence(),
    });
    expect(result.refusal).toBe("calibration-blocked");
    expect(result.shortfalls?.join(" ")).toContain("composite MAE");
    expect(mailer.sent).toEqual([]);
  });

  it("agreement within tolerance lets it go out", async () => {
    await modelScored("r-cal");
    await record(3, 0.95);
    const result = await new CoachDeliveryService(
      Database,
      new FakeMailer(),
    ).deliver({ reportId: "r-cal", evidence: evidence() });
    expect(result.delivered).toBe(true);
  });

  it("the latest measurement for the version is the one that counts", async () => {
    await modelScored("r-cal");
    await record(3, 0.95);
    await record(3, 0.5);
    const result = await new CoachDeliveryService(
      Database,
      new FakeMailer(),
    ).deliver({ reportId: "r-cal", evidence: evidence() });
    expect(result.refusal).toBe("calibration-blocked");
  });
});

describe("A report is delivered for a leader on a placeholder address", () => {
  beforeEach(async () => {
    await clear();
    await seedLeaders();
    await conn
      .updateTable("coach_leaders")
      .set({ email: PLACEHOLDER })
      .where("slug", "=", LEADER)
      .execute();
  });
  afterEach(async () => {
    await clear();
    await conn
      .deleteFrom("coach_leaders")
      .where("email", "=", PLACEHOLDER)
      .execute();
  });

  it("no email goes to the placeholder, the other recipients still receive it, and the delivery completes", async () => {
    await seedReport("r1");
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(true);
    expect(mailer.sent.map((s) => s.to)).not.toContain(PLACEHOLDER);
    expect(mailer.sent.map((s) => s.to)).toContain(EMAILS[1]);
    expect(mailer.sent.map((s) => s.to)).toContain(EMAILS[2]);
    expect(result.skipped).toEqual([PLACEHOLDER]);
  });

  it("the admin is told on the pipeline surface who was skipped, until the address is corrected", async () => {
    await seedReport("r1");
    await new CoachDeliveryService(Database, new FakeMailer()).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    const service = new CoachService(Database);
    const listed = (await service.listPipelineFailures()).sessions.find(
      (s) => s.reportId === "r1",
    );
    expect(listed).toMatchObject({
      state: "delivered",
      action: null,
      reason: `delivered, but not emailed to ${PLACEHOLDER}: placeholder address`,
    });

    await conn
      .updateTable("coach_leaders")
      .set({ email: EMAILS[0] })
      .where("slug", "=", LEADER)
      .execute();
    expect(
      (await service.listPipelineFailures()).sessions.some(
        (s) => s.reportId === "r1",
      ),
    ).toBe(false);
  });

  it("once the address is corrected, the next delivery goes to it", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ email: EMAILS[0] })
      .where("slug", "=", LEADER)
      .execute();
    await seedReport("r1");
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(Database, mailer).deliver({
      reportId: "r1",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(true);
    expect(mailer.sent.map((s) => s.to)).toContain(EMAILS[0]);
    expect(result.skipped).toEqual([]);
  });
});

describe("A first lesson is never mailed with a cold-recall improvement", () => {
  beforeEach(async () => {
    await clear();
    await seedLeaders();
  });
  afterEach(clear);

  async function firstLesson(id: string, feedback: Record<string, unknown>) {
    await seedReport(id, LEADER, {
      feedback: { headline: "new study", ...feedback },
    });
    await conn
      .updateTable("coach_reports")
      .set({ first_lesson: true, held: true })
      .where("id", "=", id)
      .execute();
  }

  it.each([
    [
      "the bullets",
      { improvements: ["Open with a cold recall of last week's big ideas"] },
    ],
    [
      "the prose the portal shows",
      {
        improvements: ["Call on quiet members"],
        improvementsProse: [
          {
            title: "No recap at the open",
            paragraphs: ["Reserve a 60-second cold-recall drill at the open."],
          },
        ],
      },
    ],
  ])(
    "one in %s holds the report from its leader and sends nothing",
    async (_, feedback) => {
      await firstLesson("r-first", feedback);
      const mailer = new FakeMailer();
      const result = await new CoachDeliveryService(Database, mailer).deliver({
        reportId: "r-first",
        evidence: evidence(),
      });
      expect(result.delivered).toBe(false);
      expect(result.refusal).toBe("cold-recall-improvement");
      expect(mailer.sent).toEqual([]);
      expect(
        await new CoachService(Database).getReportDetail(
          LEADER,
          "r-first",
          "leader",
        ),
      ).toBeNull();
      const session = await conn
        .selectFrom("coach_intake_sessions")
        .select(["state", "hold_reason", "hold_kind"])
        .where("report_id", "=", "r-first")
        .executeTakeFirstOrThrow();
      expect(session.state).toBe("scored");
      expect(session.hold_reason).toContain("cold-recall");
      expect(session.hold_kind).toBe("cold-recall");
      const listed = (
        await new CoachService(Database).listPipelineFailures({ limit: 200 })
      ).sessions.find((s) => s.reportId === "r-first");
      expect(listed).toMatchObject({
        holdKind: "cold-recall",
        coldRecall: result.coldRecall,
      });
      expect(listed?.coldRecall?.length).toBeGreaterThan(0);
    },
  );

  it("a send started but never confirmed is listed as a failed send, so the address can be fixed", async () => {
    await seedReport("r-unconfirmed");
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivery_pending", attempted_to: [EMAILS[0]] })
      .where("report_id", "=", "r-unconfirmed")
      .execute();
    const result = await new CoachDeliveryService(
      Database,
      new FakeMailer(),
    ).deliver({ reportId: "r-unconfirmed", evidence: evidence() });
    expect(result.refusal).toBe("send-failed");
    const listed = (
      await new CoachService(Database).listPipelineFailures({ limit: 200 })
    ).sessions.find((s) => s.reportId === "r-unconfirmed");
    expect(listed?.reason).toContain("never confirmed");
    expect(listed?.holdKind).toBe("send-failed");
    expect(listed?.coldRecall).toBeUndefined();
  });

  it("the admin replaces the cold-recall improvement on the held report, releases it, and it goes out", async () => {
    await firstLesson("r-first", {
      improvements: ["Open with a cold recall of last week's big ideas"],
    });
    await new CoachDeliveryService(Database, new FakeMailer()).deliver({
      reportId: "r-first",
      evidence: evidence(),
    });
    const mailer = new FakeMailer();
    const service = new CoachService(Database, mailer);
    expect(
      await service.editImprovements({
        reportId: "r-first",
        improvements: ["Call on the quiet members by name"],
        byUserId: null,
      }),
    ).toEqual({ applied: true });
    const released = await service.releaseHeldReport("r-first");
    expect(released.delivered).toBe(true);
    expect(mailer.sent.map((s) => s.to)).toContain(EMAILS[0]);
  });

  it("the same improvement on a report that is not a first lesson goes out", async () => {
    await seedReport("r-cont", LEADER, {
      feedback: {
        headline: "continuing",
        improvements: ["Open with a cold recall of last week's big ideas"],
      },
    });
    const result = await new CoachDeliveryService(
      Database,
      new FakeMailer(),
    ).deliver({
      reportId: "r-cont",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(true);
  });
});

describe("a report its leader was already emailed is never hidden again", () => {
  beforeEach(async () => {
    await clear();
    await seedLeaders();
  });
  afterEach(clear);

  async function partiallyDelivered(id: string) {
    await seedReport(id, LEADER, {
      feedback: {
        headline: "new study",
        improvements: ["Open with a cold recall of last week's big ideas"],
      },
    });
    const first = await new CoachDeliveryService(
      Database,
      new FakeMailer((to) => to === EMAILS[2]),
    ).deliver({ reportId: id, evidence: evidence() });
    expect(first.refusal).toBe("send-failed");
  }

  it.each([
    [
      "a first-lesson flag with a cold-recall improvement",
      async (id: string) => {
        await conn
          .updateTable("coach_reports")
          .set({ first_lesson: true })
          .where("id", "=", id)
          .execute();
      },
    ],
    [
      "a governance violation",
      async (id: string) => {
        await conn
          .updateTable("coach_reports")
          .set({
            body: { feedback: { headline: "Not yet at Avery Hollis's level" } },
          })
          .where("id", "=", id)
          .execute();
      },
    ],
    [
      "a calibration shortfall",
      async (id: string) => {
        await conn
          .insertInto("coach_report_dimension_scores")
          .values({
            report_id: id,
            dimension_n: 1,
            score: 4,
            rationale: "a reason",
            provenance: "machine",
            model_version: "v-never-calibrated",
          })
          .execute();
      },
    ],
  ])(
    "%s arising before the retry does not re-hide it: the retry mails only the recipients still owed",
    async (_, arise) => {
      await partiallyDelivered("r-owed");
      await arise("r-owed");
      const retry = new FakeMailer();
      const result = await new CoachDeliveryService(Database, retry).deliver({
        reportId: "r-owed",
        evidence: evidence(),
      });
      expect(result.delivered).toBe(true);
      expect(retry.sent.map((s) => s.to)).toEqual([EMAILS[2]]);
      const report = await conn
        .selectFrom("coach_reports")
        .select("held")
        .where("id", "=", "r-owed")
        .executeTakeFirstOrThrow();
      expect(report.held).toBe(false);
      expect(
        await new CoachService(Database).getReportDetail(
          LEADER,
          "r-owed",
          "leader",
        ),
      ).not.toBeNull();
    },
  );

  it("a partially delivered report whose remaining send keeps failing is listed with the ways out: fix the address, then requeue", async () => {
    await partiallyDelivered("r-bouncing");
    const bouncing = new FakeMailer((to) => to === EMAILS[2]);
    for (let attempt = 2; attempt <= DELIVERY_ATTEMPT_LIMIT; attempt += 1)
      await new CoachDeliveryService(Database, bouncing).deliver({
        reportId: "r-bouncing",
        evidence: evidence(),
      });
    const service = new CoachService(Database);
    const listed = (await service.listPipelineFailures()).sessions.find(
      (s) => s.reportId === "r-bouncing",
    );
    expect(listed?.state).toBe("delivery_failed");
    expect(listed?.action).toBe("requeue");
    expect(listed?.reason).toContain(`already emailed to ${EMAILS[0]}`);
    expect(listed?.reason).toContain(`send failed to ${EMAILS[2]} (rejected)`);
    expect(listed?.reason).toContain("fix the failing address");
    expect(listed?.reason).toContain("requeue");

    expect(await service.requeuePipelineFailure("ff-r-bouncing")).toBe(true);
    const fixed = new FakeMailer();
    const result = await new CoachDeliveryService(Database, fixed).deliver({
      reportId: "r-bouncing",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(true);
    expect(fixed.sent.map((s) => s.to)).toEqual([EMAILS[2]]);
    expect(
      (await service.listPipelineFailures()).sessions.some(
        (s) => s.reportId === "r-bouncing",
      ),
    ).toBe(false);
  });

  it("while its retries last, a partially delivered report is listed as retrying, naming who still waits", async () => {
    await partiallyDelivered("r-retrying");
    const listed = (
      await new CoachService(Database).listPipelineFailures()
    ).sessions.find((s) => s.reportId === "r-retrying");
    expect(listed?.state).toBe("delivery_pending");
    expect(listed?.action).toBeNull();
    expect(listed?.reason).toContain(`send failed to ${EMAILS[2]} (rejected)`);
    expect(listed?.reason).toContain(
      `retried automatically (attempt 1 of ${DELIVERY_ATTEMPT_LIMIT})`,
    );
  });

  it("a retry that fails again counts the attempt and still leaves the report open to its leader", async () => {
    await partiallyDelivered("r-owed");
    await conn
      .updateTable("coach_reports")
      .set({ first_lesson: true })
      .where("id", "=", "r-owed")
      .execute();
    const result = await new CoachDeliveryService(
      Database,
      new FakeMailer((to) => to === EMAILS[2]),
    ).deliver({ reportId: "r-owed", evidence: evidence() });
    expect(result.refusal).toBe("send-failed");
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .innerJoin(
        "coach_reports",
        "coach_reports.id",
        "coach_intake_sessions.report_id",
      )
      .select(["state", "retry_count", "held"])
      .where("report_id", "=", "r-owed")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      state: "delivery_pending",
      retry_count: 2,
      held: false,
    });
  });
});

describe("a pipeline report is shown to its leader at its first confirmed send", () => {
  beforeEach(async () => {
    await clear();
    await seedLeaders();
  });
  afterEach(clear);

  async function seedHeld(id: string) {
    await seedReport(id);
    await conn
      .updateTable("coach_reports")
      .set({ held: true })
      .where("id", "=", id)
      .execute();
  }

  async function heldOf(id: string) {
    return (
      await conn
        .selectFrom("coach_reports")
        .select("held")
        .where("id", "=", id)
        .executeTakeFirstOrThrow()
    ).held;
  }

  it("nothing is published before the first send is accepted, and the report is open before the next send", async () => {
    await seedHeld("r-first-send");
    const heldAtSend: boolean[] = [];
    class Watching extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        heldAtSend.push(await heldOf("r-first-send"));
        return super.sendEmail(data);
      }
    }
    const result = await new CoachDeliveryService(
      Database,
      new Watching(),
    ).deliver({ reportId: "r-first-send", evidence: evidence() });
    expect(result.delivered).toBe(true);
    expect(heldAtSend[0]).toBe(true);
    expect(heldAtSend.slice(1).every((held) => held === false)).toBe(true);
    expect(heldAtSend.length).toBeGreaterThan(1);
  });

  it("when every send fails nothing is published, and the report stays correctable and gated", async () => {
    await seedHeld("r-all-failed");
    const failed = await new CoachDeliveryService(
      Database,
      new FakeMailer(() => true),
    ).deliver({ reportId: "r-all-failed", evidence: evidence() });
    expect(failed.refusal).toBe("send-failed");
    expect(await heldOf("r-all-failed")).toBe(true);
    expect(
      await new CoachService(Database).getReportDetail(
        LEADER,
        "r-all-failed",
        "leader",
      ),
    ).toBeNull();

    const edited = await new CoachReviewService(Database).editImprovements({
      reportId: "r-all-failed",
      improvements: ["Not yet at Avery Hollis's level"],
      byUserId: null,
    });
    expect(edited.ok).toBe(true);

    const retry = new FakeMailer();
    const blocked = await new CoachDeliveryService(Database, retry).deliver({
      reportId: "r-all-failed",
      evidence: evidence(),
    });
    expect(blocked.refusal).toBe("governance-blocked");
    expect(retry.sent).toEqual([]);
    expect(await heldOf("r-all-failed")).toBe(true);
  });

  it("a report recorded as emailed but still hidden (a crash between the two writes) is opened by the next run even when its sends fail", async () => {
    await seedHeld("r-crashed");
    await conn
      .updateTable("coach_intake_sessions")
      .set({
        state: "delivery_pending",
        delivered_to: sql`ARRAY[${EMAILS[0]}]::text[]`,
      })
      .where("report_id", "=", "r-crashed")
      .execute();
    const result = await new CoachDeliveryService(
      Database,
      new FakeMailer(() => true),
    ).deliver({ reportId: "r-crashed", evidence: evidence() });
    expect(result.refusal).toBe("send-failed");
    expect(await heldOf("r-crashed")).toBe(false);
  });

  function crashAt(
    service: CoachDeliveryService,
    when: "before-record" | "after-record",
  ) {
    const internals = service as unknown as {
      recordRecipient: (...args: unknown[]) => Promise<boolean>;
    };
    const record = internals.recordRecipient.bind(service);
    internals.recordRecipient = async (...args: unknown[]) => {
      if (when === "after-record") await record(...args);
      throw new Error("connection lost");
    };
  }

  async function ageClaim(id: string) {
    await conn
      .updateTable("coach_intake_sessions")
      .set({ updated_at: sql`NOW() - interval '16 minutes'` })
      .where("report_id", "=", id)
      .execute();
  }

  it("a crash after an accepted send and before it is recorded: the next run opens the report first, skips the gates, and does not mail that recipient again until requeued", async () => {
    await seedHeld("r-crash-sent");
    const first = new FakeMailer();
    const crashing = new CoachDeliveryService(Database, first);
    crashAt(crashing, "before-record");
    await expect(
      crashing.deliver({ reportId: "r-crash-sent", evidence: evidence() }),
    ).rejects.toThrow("connection lost");
    expect(first.sent.map((s) => s.to)).toEqual([EMAILS[0]]);

    await conn
      .updateTable("coach_reports")
      .set({
        body: { feedback: { headline: "Not yet at Avery Hollis's level" } },
      })
      .where("id", "=", "r-crash-sent")
      .execute();
    await ageClaim("r-crash-sent");

    const heldAtSend: boolean[] = [];
    class Watching extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        heldAtSend.push(await heldOf("r-crash-sent"));
        return super.sendEmail(data);
      }
    }
    const next = new Watching();
    const result = await new CoachDeliveryService(Database, next).deliver({
      reportId: "r-crash-sent",
      evidence: evidence(),
    });
    expect(result.refusal).toBe("send-failed");
    const resent = next.sent.map((s) => s.to);
    expect(resent).not.toContain(EMAILS[0]);
    expect(resent).toContain(EMAILS[1]);
    expect(resent).toContain(EMAILS[2]);
    expect(heldAtSend.every((held) => held === false)).toBe(true);
    expect(await heldOf("r-crash-sent")).toBe(false);
    const edit = await new CoachReviewService(Database).editImprovements({
      reportId: "r-crash-sent",
      improvements: ["Ask one open question per passage"],
      byUserId: null,
    });
    expect(edit.refusal).toBe("partially-delivered");

    const service = new CoachService(Database);
    const listed = (await service.listPipelineFailures()).sessions.find(
      (s) => s.reportId === "r-crash-sent",
    );
    expect(listed?.reason).toContain(EMAILS[0]);
    expect(listed?.reason).toContain("requeue");

    for (let attempt = 2; attempt <= DELIVERY_ATTEMPT_LIMIT; attempt += 1) {
      const idle = new FakeMailer();
      await new CoachDeliveryService(Database, idle).deliver({
        reportId: "r-crash-sent",
        evidence: evidence(),
      });
      expect(idle.sent).toEqual([]);
    }
    const exhausted = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("report_id", "=", "r-crash-sent")
      .executeTakeFirstOrThrow();
    expect(exhausted.state).toBe("delivery_failed");
    expect(await heldOf("r-crash-sent")).toBe(false);

    expect(await service.requeuePipelineFailure("ff-r-crash-sent")).toBe(true);
    const requeued = new FakeMailer();
    const done = await new CoachDeliveryService(Database, requeued).deliver({
      reportId: "r-crash-sent",
      evidence: evidence(),
    });
    expect(done.delivered).toBe(true);
    expect(requeued.sent.map((s) => s.to)).toEqual([EMAILS[0]]);
  });

  it("a crash right after an accepted send is recorded leaves the report open, and the next run mails only the recipients still owed", async () => {
    await seedHeld("r-crash-recorded");
    const crashing = new CoachDeliveryService(Database, new FakeMailer());
    crashAt(crashing, "after-record");
    await expect(
      crashing.deliver({ reportId: "r-crash-recorded", evidence: evidence() }),
    ).rejects.toThrow("connection lost");
    expect(await heldOf("r-crash-recorded")).toBe(false);
    expect(
      await new CoachService(Database).getReportDetail(
        LEADER,
        "r-crash-recorded",
        "leader",
      ),
    ).not.toBeNull();

    await ageClaim("r-crash-recorded");
    const next = new FakeMailer();
    const result = await new CoachDeliveryService(Database, next).deliver({
      reportId: "r-crash-recorded",
      evidence: evidence(),
    });
    expect(result.delivered).toBe(true);
    expect(next.sent.map((s) => s.to)).not.toContain(EMAILS[0]);
    expect(next.sent.map((s) => s.to)).toContain(EMAILS[1]);
  });

  it("a report whose every recipient is a placeholder is published with nothing sent", async () => {
    await seedHeld("r-nobody");
    const rolledBack = new Error("rolled back");
    let outcome = null as {
      held: boolean;
      sent: number;
      refusal?: string;
    } | null;
    await conn
      .transaction()
      .execute(async (trx) => {
        await trx.deleteFrom("coach_admins").execute();
        await trx
          .updateTable("coach_leaders")
          .set({ email: sql`slug || '@needs-real-email.invalid'` })
          .where("slug", "in", [LEADER, BENCH])
          .execute();
        const scoped = {
          getOrCreateConnection: () => trx,
        } as unknown as typeof Database;
        const mailer = new FakeMailer();
        const result = await new CoachDeliveryService(scoped, mailer).deliver({
          reportId: "r-nobody",
          evidence: evidence(),
        });
        const report = await trx
          .selectFrom("coach_reports")
          .select("held")
          .where("id", "=", "r-nobody")
          .executeTakeFirstOrThrow();
        outcome = {
          held: report.held,
          sent: mailer.sent.length,
          refusal: result.refusal,
        };
        throw rolledBack;
      })
      .catch((e) => {
        if (e !== rolledBack) throw e;
      });
    expect(outcome).toEqual({ held: false, sent: 0, refusal: "send-failed" });
  });

  it("a report published with nobody to email is never hidden again by a retry, and refuses corrections", async () => {
    await seedHeld("r-shown-nobody");
    const rolledBack = new Error("rolled back");
    let outcome = null as {
      retry?: string;
      held: boolean;
      sent: number;
      edit?: string;
      firstLesson?: string;
    } | null;
    await conn
      .transaction()
      .execute(async (trx) => {
        await trx.deleteFrom("coach_admins").execute();
        await trx
          .updateTable("coach_leaders")
          .set({ email: sql`slug || '@needs-real-email.invalid'` })
          .where("slug", "in", [LEADER, BENCH])
          .execute();
        const flat = new Proxy(trx, {
          get(target, prop) {
            if (prop === "transaction")
              return () => ({
                execute: (fn: (t: typeof trx) => unknown) => fn(target),
              });
            const value = Reflect.get(target, prop, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const scoped = {
          getOrCreateConnection: () => flat,
        } as unknown as typeof Database;
        const mailer = new FakeMailer();
        const first = await new CoachDeliveryService(scoped, mailer).deliver({
          reportId: "r-shown-nobody",
          evidence: evidence(),
        });
        expect(first.refusal).toBe("send-failed");
        await trx
          .updateTable("coach_reports")
          .set({
            body: { feedback: { headline: "Not yet at Avery Hollis's level" } },
          })
          .where("id", "=", "r-shown-nobody")
          .execute();
        const retry = await new CoachDeliveryService(scoped, mailer).deliver({
          reportId: "r-shown-nobody",
          evidence: evidence(),
        });
        const report = await trx
          .selectFrom("coach_reports")
          .select("held")
          .where("id", "=", "r-shown-nobody")
          .executeTakeFirstOrThrow();
        const review = new CoachReviewService(scoped);
        const edit = await review.editImprovements({
          reportId: "r-shown-nobody",
          improvements: ["Ask one open question per passage"],
          byUserId: null,
        });
        const firstLesson = await review.setFirstLesson({
          reportId: "r-shown-nobody",
          firstLesson: true,
          byUserId: null,
        });
        outcome = {
          retry: retry.refusal,
          held: report.held,
          sent: mailer.sent.length,
          edit: edit.refusal,
          firstLesson: firstLesson.refusal,
        };
        throw rolledBack;
      })
      .catch((e) => {
        if (e !== rolledBack) throw e;
      });
    expect(outcome).toEqual({
      retry: "send-failed",
      held: false,
      sent: 0,
      edit: "partially-delivered",
      firstLesson: "partially-delivered",
    });
  });
});
