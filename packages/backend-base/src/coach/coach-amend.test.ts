import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import {
  CoachAmendService,
  coldRecallImprovements,
} from "./coach-amend.service";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { CoachDeliveryService, reportSubject } from "./coach-delivery.service";
import { CoachReviewService } from "./coach-review.service";
import { CoachService } from "./coach.service";
import { DIMENSIONS } from "./rubric";

const conn = Database.getOrCreateConnection();
const LEADER = "amend-leader";
const OTHER = "amend-other";
const BENCH = "amend-bench";
const REPORT = "amend-report";
const LEADER_EMAIL = "amend-leader@example.test";
const BENCH_EMAIL = "amend-bench@example.test";
const ADMIN_EMAIL = "amend-admin@example.test";
const EMAILS = [LEADER_EMAIL, BENCH_EMAIL, ADMIN_EMAIL];
const QUOTE = "we keep coming back to what grace costs";

class FakeMailer {
  sent: Array<{ to: string; subject: string; text: string }> = [];
  constructor(private readonly fail: (to: string) => boolean = () => false) {}
  async sendEmail(data: {
    subject: string;
    to: { email: string };
    text: string;
  }) {
    this.sent.push({
      to: data.to.email,
      subject: data.subject,
      text: data.text,
    });
    return this.fail(data.to.email)
      ? { delivered: false, error: "rejected" }
      : { delivered: true };
  }
}

async function seed(
  options: {
    id?: string;
    coachId?: string;
    state?: string;
    improvements?: string[];
    legacy?: boolean;
    firstLesson?: boolean;
  } = {},
) {
  const id = options.id ?? REPORT;
  const coachId = options.coachId ?? LEADER;
  const source = options.legacy ? `legacy:${coachId}:2026-09-26` : `ff-${id}`;
  const notes = DIMENSIONS.map((d) =>
    d.n === 3 ? `cited "${QUOTE}" at 14:05` : `machine ${d.n}`,
  );
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: coachId,
      session_date: "2026-09-26",
      source_session_id: source,
      legacy_ids: [],
      first_lesson: options.firstLesson ?? false,
      summary: { session: "Jonah, Lesson 2", score: 80, status: "Strong" },
      metrics: JSON.stringify({
        newcomerBonus: 0,
        sizeBonus: 0,
        dimensions: DIMENSIONS.map((d, i) => ({
          n: d.n,
          name: d.name,
          score: 4,
          note: notes[i],
        })),
      }),
      body: JSON.stringify({
        bigIdeas: [],
        feedback: {
          headline: "A steady session",
          strengths: ["Scripture first"],
          improvements: options.improvements ?? ["Call on quiet members"],
          recommendations: ["Ask one DOK 4 question"],
        },
      }),
      evidence: JSON.stringify({ quotes: [QUOTE], timestamps: ["14:05"] }),
    })
    .execute();
  if (options.legacy) return;
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: source,
      coach_id: coachId,
      title: "Jonah, Lesson 2",
      session_date: "2026-09-26",
      state: options.state ?? "delivered",
      report_id: id,
      delivered_to: EMAILS,
    })
    .execute();
  await conn
    .insertInto("coach_report_dimension_scores")
    .values(
      DIMENSIONS.map((d, i) => ({
        report_id: id,
        dimension_n: d.n,
        score: 4,
        rationale: notes[i],
        provenance: "machine",
        model_version: "v3-weighted-100",
      })),
    )
    .execute();
}

async function clear() {
  for (const c of [LEADER, OTHER, BENCH]) {
    await conn
      .deleteFrom("coach_intake_sessions")
      .where("coach_id", "=", c)
      .execute();
    await conn.deleteFrom("coach_reports").where("coach_id", "=", c).execute();
  }
  await conn
    .deleteFrom("coach_leaders")
    .where("slug", "in", [LEADER, OTHER, BENCH])
    .execute();
  await conn.deleteFrom("coach_admins").where("email", "in", EMAILS).execute();
}

async function seedPeople(leaderEmail = LEADER_EMAIL) {
  await conn
    .insertInto("coach_leaders")
    .values([
      { slug: LEADER, email: leaderEmail, name: "Milo Kerr" },
      { slug: OTHER, email: "amend-other@example.test", name: "Hal Brin" },
      {
        slug: BENCH,
        email: BENCH_EMAIL,
        name: "Avery Hollis",
        is_benchmark: true,
      },
    ])
    .execute();
  await conn
    .insertInto("coach_admins")
    .values({ email: ADMIN_EMAIL })
    .execute();
}

async function row(id = REPORT) {
  return conn
    .selectFrom("coach_reports")
    .select(["summary", "body", "first_lesson", "first_lesson_source", "held"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}

async function dimension(n: number, id = REPORT) {
  return conn
    .selectFrom("coach_report_dimension_scores")
    .select(["score", "rationale", "provenance"])
    .where("report_id", "=", id)
    .where("dimension_n", "=", n)
    .executeTakeFirstOrThrow();
}

const ours = (mailer: FakeMailer) =>
  mailer.sent.filter((s) => EMAILS.includes(s.to) || s.to.endsWith(".invalid"));

const originalSubject = reportSubject({
  sessionDate: "2026-09-26",
  leaderName: "Milo Kerr",
  sessionTitle: "Jonah, Lesson 2",
});

describe("a delivered report can be revised", () => {
  beforeEach(async () => {
    process.env[COACH_PIPELINE_LIVE] = "true";
    await clear();
    await seedPeople();
  });
  afterEach(async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    await clear();
  });

  it("A leader asks for a change and an admin makes it", async () => {
    await seed();
    const mailer = new FakeMailer();
    const result = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: {
        dimensions: [
          { n: 5, score: 2, rationale: "only two application questions" },
        ],
      },
      byUserId: null,
    });

    expect(result.applied).toBe(true);
    expect(result.revision).toBe(1);
    expect(result.sent).toBe(true);
    expect(await dimension(5)).toEqual({
      score: 2,
      rationale: "only two application questions",
      provenance: "human",
    });

    const service = new CoachService(Database);
    const leaderView = (await service.getReportDetail(
      LEADER,
      REPORT,
    )) as Record<string, unknown> | null;
    const dims = leaderView?.dimensions as Array<{ n: number; note: string }>;
    expect(dims.find((d) => d.n === 5)?.note).toBe(
      "only two application questions",
    );
    expect(leaderView?.score).toBe(result.score);
    expect(result.score).toBeLessThan(80);

    const sent = ours(mailer);
    expect(sent.map((s) => s.to).sort()).toEqual([...EMAILS].sort());
    for (const s of sent) {
      expect(s.subject).toBe(`${originalSubject} (revised)`);
      expect(s.text).toContain(`/coach?s=${REPORT}`);
    }

    const [revision] = await service.listRevisions(REPORT);
    expect(revision.revision).toBe(1);
    expect(revision.sentAt).not.toBeNull();
    const previous = revision.previous as {
      dimensions: Array<{ n: number; rationale: string; score: number }>;
    };
    expect(previous.dimensions.find((d) => d.n === 5)).toMatchObject({
      score: 4,
      rationale: "machine 5",
    });
    expect(revision.changes).toMatchObject({
      dimensions: [
        {
          n: 5,
          from: { score: 4, rationale: "machine 5" },
          to: { score: 2, rationale: "only two application questions" },
        },
      ],
    });
  });

  it("An amendment breaks a governance rule: nothing is sent and the delivered version stays live", async () => {
    await seed();
    const mailer = new FakeMailer();
    const result = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: { body: { headline: "Closer to how Avery Hollis opens" } },
      byUserId: null,
    });

    expect(result.applied).toBe(false);
    expect(result.refusal).toBe("governance-blocked");
    expect(result.violations?.map((v) => v.rule)).toEqual(["benchmark-name"]);
    expect(ours(mailer)).toEqual([]);
    expect(
      ((await row()).body as { feedback: { headline: string } }).feedback
        .headline,
    ).toBe("A steady session");
    expect(await new CoachService(Database).listRevisions(REPORT)).toEqual([]);
  });

  it("the benchmark name in an amended rationale is caught too", async () => {
    await seed();
    const result = await new CoachAmendService(
      Database,
      new FakeMailer(),
    ).amend({
      reportId: REPORT,
      amendment: {
        dimensions: [{ n: 4, score: 3, rationale: "talks like Avery Hollis" }],
      },
      byUserId: null,
    });
    expect(result.refusal).toBe("governance-blocked");
    expect((await dimension(4)).rationale).toBe("machine 4");
  });

  it("a revision is never blocked by its own earlier version's evidence", async () => {
    await seed();
    const amend = new CoachAmendService(Database, new FakeMailer());
    const first = await amend.amend({
      reportId: REPORT,
      amendment: { dimensions: [{ n: 6, score: 3, rationale: "half spoke" }] },
      byUserId: null,
    });
    expect(first.applied).toBe(true);
    const second = await amend.amend({
      reportId: REPORT,
      amendment: { body: { headline: "A steady session, revised" } },
      byUserId: null,
    });
    expect(second.applied).toBe(true);
    expect(second.revision).toBe(2);
  });

  it("a quote this leader used in another report still blocks the revision", async () => {
    await seed();
    await seed({ id: "amend-earlier" });
    await conn
      .updateTable("coach_reports")
      .set({
        evidence: JSON.stringify({
          quotes: ["a quote from an earlier week"],
          timestamps: [],
        }),
      })
      .where("id", "=", "amend-earlier")
      .execute();
    const result = await new CoachAmendService(
      Database,
      new FakeMailer(),
    ).amend({
      reportId: REPORT,
      amendment: {
        dimensions: [
          { n: 6, score: 3, rationale: 'said "a quote from an earlier week"' },
        ],
      },
      byUserId: null,
    });
    expect(result.refusal).toBe("governance-blocked");
    expect(result.violations?.map((v) => v.rule)).toContain("reused-quote");
  });

  it("The link a leader already has opens the revised report", async () => {
    await seed();
    const mailer = new FakeMailer();
    await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: { body: { headline: "A steady, revised session" } },
      byUserId: null,
    });
    const opened = (await new CoachService(Database).getReportDetail(
      LEADER,
      REPORT,
    )) as { feedback: { headline: string } } | null;
    expect(opened?.feedback.headline).toBe("A steady, revised session");
    expect((await row()).held).toBe(false);
    for (const s of ours(mailer))
      expect(s.text).toContain(`/coach?s=${REPORT}`);
  });

  it("A report is flagged a first lesson after its body was written: held until the cold-recall improvement is replaced", async () => {
    await seed({
      improvements: [
        "Open with a cold recall of last week's big ideas",
        "Call on quiet members",
      ],
    });
    const mailer = new FakeMailer();
    const service = new CoachService(Database, mailer);
    const held = await service.setFirstLesson({
      reportId: REPORT,
      firstLesson: true,
      byUserId: null,
    });
    expect(held.applied).toBe(false);
    expect(held.refusal).toBe("cold-recall-improvement");
    expect((held as { coldRecall?: string[] }).coldRecall).toEqual([
      "Open with a cold recall of last week's big ideas",
    ]);
    expect(ours(mailer)).toEqual([]);
    expect((await row()).first_lesson).toBe(false);
    expect((await dimension(9)).score).toBe(4);

    const replaced = await service.amendReport({
      reportId: REPORT,
      amendment: {
        firstLesson: true,
        body: {
          improvements: [
            "Name the study's big idea before the first reading",
            "Call on quiet members",
          ],
        },
      },
      byUserId: null,
    });
    expect(replaced.applied).toBe(true);
    expect(replaced.sent).toBe(true);
    const after = await row();
    expect(after.first_lesson).toBe(true);
    expect(after.first_lesson_source).toBe("admin");
    expect((await dimension(9)).score).toBeNull();
    expect((await dimension(9)).provenance).toBe("human");
  });

  it("clearing the flag on a delivered report needs the dimension 9 score and goes out as a revision", async () => {
    await seed({ firstLesson: true });
    await conn
      .updateTable("coach_report_dimension_scores")
      .set({ score: null })
      .where("report_id", "=", REPORT)
      .where("dimension_n", "=", 9)
      .execute();
    const mailer = new FakeMailer();
    const service = new CoachService(Database, mailer);
    const refused = await service.setFirstLesson({
      reportId: REPORT,
      firstLesson: false,
      byUserId: null,
    });
    expect(refused.refusal).toBe("memory-reinforcement-required");
    const direct = await service.amendReport({
      reportId: REPORT,
      amendment: { firstLesson: false },
      byUserId: null,
    });
    expect(direct.refusal).toBe("memory-reinforcement-required");
    expect((await row()).first_lesson).toBe(true);

    const cleared = await service.setFirstLesson({
      reportId: REPORT,
      firstLesson: false,
      score: 3,
      rationale: "opened with last week's big ideas",
      byUserId: null,
    });
    expect(cleared.applied).toBe(true);
    expect((cleared as { revision?: number }).revision).toBe(1);
    expect(await dimension(9)).toEqual({
      score: 3,
      rationale: "opened with last week's big ideas",
      provenance: "human",
    });
    expect(ours(mailer).length).toBe(3);
  });

  it("a legacy report cannot be amended, and an undelivered one goes through review instead", async () => {
    await seed({ id: "amend-legacy", legacy: true });
    await seed({ id: "amend-scored", state: "scored" });
    const amend = new CoachAmendService(Database, new FakeMailer());
    const change = { body: { headline: "changed" } };
    expect(
      (
        await amend.amend({
          reportId: "amend-legacy",
          amendment: change,
          byUserId: null,
        })
      ).refusal,
    ).toBe("legacy-report");
    expect(
      (
        await amend.amend({
          reportId: "amend-scored",
          amendment: change,
          byUserId: null,
        })
      ).refusal,
    ).toBe("not-delivered");
  });

  it("the pre-delivery correction path still refuses a delivered report", async () => {
    await seed();
    const result = await new CoachReviewService(Database).correct({
      reportId: REPORT,
      dimensionN: 5,
      score: 2,
      rationale: "x",
      correctedByUserId: null,
    });
    expect(result.refusal).toBe("already-delivered");
  });

  it("a placeholder address is skipped and reported, and the others still get the revision", async () => {
    await clear();
    await seedPeople("amend-leader@needs-real-email.invalid");
    await seed();
    const mailer = new FakeMailer();
    const result = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: { body: { headline: "revised" } },
      byUserId: null,
    });
    expect(result.sent).toBe(true);
    expect(result.skipped).toEqual(["amend-leader@needs-real-email.invalid"]);
    expect(
      ours(mailer)
        .map((s) => s.to)
        .sort(),
    ).toEqual([BENCH_EMAIL, ADMIN_EMAIL].sort());
  });

  it("a failed send is retried to the missing recipient only", async () => {
    await seed();
    let failLeader = true;
    const mailer = new FakeMailer((to) => failLeader && to === LEADER_EMAIL);
    const result = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: { body: { headline: "revised" } },
      byUserId: null,
    });
    expect(result.sent).toBe(false);
    expect(result.pending).toBe("send-failed");

    failLeader = false;
    mailer.sent = [];
    const retry = await new CoachDeliveryService(Database, mailer).sendRevision(
      REPORT,
    );
    expect(retry.sent).toBe(true);
    expect(ours(mailer).map((s) => s.to)).toEqual([LEADER_EMAIL]);
    expect(
      (await new CoachDeliveryService(Database, mailer).sendRevision(REPORT))
        .refusal,
    ).toBe("already-sent");
  });

  it("before cutover the amendment is stored and nothing is sent until an admin sends it after cutover", async () => {
    await seed();
    delete process.env[COACH_PIPELINE_LIVE];
    const mailer = new FakeMailer();
    const result = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: { body: { headline: "revised in the parallel run" } },
      byUserId: null,
    });
    expect(result.applied).toBe(true);
    expect(result.sent).toBe(false);
    expect(result.pending).toBe("parallel-run");
    expect(ours(mailer)).toEqual([]);
    expect(
      (await new CoachDeliveryService(Database, mailer).sendRevision(REPORT))
        .refusal,
    ).toBe("parallel-run");

    process.env[COACH_PIPELINE_LIVE] = "true";
    const sent = await new CoachDeliveryService(Database, mailer).sendRevision(
      REPORT,
    );
    expect(sent.sent).toBe(true);
    expect(ours(mailer).length).toBe(3);
  });
});

describe("what counts as a cold-recall improvement", () => {
  it("names a cold recall, or asks to recall or review prior big ideas", () => {
    expect(
      coldRecallImprovements([
        "Open with a cold recall drill",
        "Review last week's big ideas before the reading",
        { title: "Recap the prior big ideas", paragraphs: ["at the open"] },
        "Call on quiet members",
        "Review the homework",
        "Name the big idea of this passage",
      ]),
    ).toEqual([
      "Open with a cold recall drill",
      "Review last week's big ideas before the reading",
      "Recap the prior big ideas at the open",
    ]);
  });
});
