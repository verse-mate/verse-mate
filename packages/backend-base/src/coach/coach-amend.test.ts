import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { db as Database } from "database";
import { getCleanConnectionString } from "database/src/utils/ssl-config";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import { CoachAmendService } from "./coach-amend.service";
import { reattributeSession } from "./coach-attribution";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { CoachDeliveryService, reportSubject } from "./coach-delivery.service";
import { coldRecallImprovements } from "./coach-governance.service";
import { CoachReviewService } from "./coach-review.service";
import { isolateTable } from "./coach-test-tables";
import { CoachService } from "./coach.service";
import { DIMENSIONS } from "./rubric";

const conn = Database.getOrCreateConnection();
isolateTable("coach_admins");
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
  sent: Array<{ to: string; subject: string; text: string; html: string }> = [];
  constructor(private readonly fail: (to: string) => boolean = () => false) {}
  async sendEmail(data: {
    subject: string;
    to: { email: string };
    text: string;
    html?: string;
  }) {
    this.sent.push({
      to: data.to.email,
      subject: data.subject,
      text: data.text,
      html: data.html ?? "",
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
    improvementsProse?: Array<{ title: string; paragraphs: string[] }>;
    legacy?: boolean;
    firstLesson?: boolean;
    keyMoments?: Array<{ quote: string; timestamp: string }>;
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
          strengthsProse: [
            {
              title: "Scripture first",
              paragraphs: ["Read before discussing."],
            },
          ],
          ...(options.improvementsProse
            ? { improvementsProse: options.improvementsProse }
            : {}),
        },
        keyMoments: options.keyMoments ?? [
          { quote: QUOTE, timestamp: "14:05" },
        ],
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

const ours = (mailer: FakeMailer) => mailer.sent;

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

    const [revision] = (await service.listRevisions(REPORT)).filter(
      (r) => r.kind === "revision",
    );
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

  it("two simultaneous amendments: each kept version is the report as the one before left it", async () => {
    await seed();
    delete process.env[COACH_PIPELINE_LIVE];
    const amend = new CoachAmendService(Database, new FakeMailer());
    const results = await Promise.all([
      amend.amend({
        reportId: REPORT,
        amendment: { body: { headline: "first concurrent headline" } },
        byUserId: null,
      }),
      amend.amend({
        reportId: REPORT,
        amendment: { body: { strengths: ["second concurrent strength"] } },
        byUserId: null,
      }),
    ]);
    expect(results.map((r) => r.revision).sort()).toEqual([1, 2]);

    const revisions = (
      await new CoachService(Database).listRevisions(REPORT)
    ).filter((r) => r.kind === "revision");
    const byRevision = new Map(revisions.map((r) => [r.revision, r]));
    const first = byRevision.get(1);
    const second = byRevision.get(2);
    const firstChanges = (
      first?.changes as { body: Record<string, { to: unknown }> }
    ).body;
    const keptBySecond = (
      second?.previous as { body: { feedback: Record<string, unknown> } }
    ).body.feedback;
    for (const [field, change] of Object.entries(firstChanges))
      expect(keptBySecond[field] ?? null).toEqual(change.to as object | null);

    const feedback = (
      (await row()).body as { feedback: Record<string, unknown> }
    ).feedback;
    expect(feedback.headline).toBe("first concurrent headline");
    expect(feedback.strengths).toEqual(["second concurrent strength"]);
  });

  const POOL_PROBE = "coach-amend-pool-probe";

  async function withPoolOf<T>(
    max: number,
    run: (pool: typeof Database) => Promise<T>,
  ): Promise<T> {
    const kysely = new Kysely<never>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: getCleanConnectionString(),
          max,
          application_name: POOL_PROBE,
        }),
      }),
    });
    const pool = {
      getOrCreateConnection: () => kysely,
      closeConnection: () => undefined,
    } as unknown as typeof Database;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        run(pool),
        new Promise<never>((_, reject) => {
          timer = setTimeout(async () => {
            await sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = ${POOL_PROBE}`.execute(
              conn,
            );
            reject(new Error(`pool of ${max} deadlocked`));
          }, 3000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      void kysely.destroy();
    }
  }

  it("an amendment completes on a pool of one connection", async () => {
    await seed();
    delete process.env[COACH_PIPELINE_LIVE];
    const result = await withPoolOf(1, (pool) =>
      new CoachAmendService(pool, null).amend({
        reportId: REPORT,
        amendment: { body: { headline: "amended on one connection" } },
        byUserId: null,
      }),
    );
    expect(result.applied).toBe(true);
  });

  it("as many concurrent amendments as the pool has connections all complete", async () => {
    await seed();
    delete process.env[COACH_PIPELINE_LIVE];
    const results = await withPoolOf(2, (pool) => {
      const amend = new CoachAmendService(pool, null);
      return Promise.all(
        ["first", "second"].map((word) =>
          amend.amend({
            reportId: REPORT,
            amendment: { body: { headline: `${word} on a pool of two` } },
            byUserId: null,
          }),
        ),
      );
    });
    expect(results.map((r) => r.revision).sort()).toEqual([1, 2]);
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
    await seed({
      keyMoments: [
        { quote: "a line from the amended week", timestamp: "21:15" },
      ],
    });
    const amend = new CoachAmendService(Database, new FakeMailer());
    const first = await amend.amend({
      reportId: REPORT,
      amendment: { body: { headline: "A steady session, revised once" } },
      byUserId: null,
    });
    expect(first.applied).toBe(true);
    const stored = (
      await conn
        .selectFrom("coach_reports")
        .select("evidence")
        .where("id", "=", REPORT)
        .executeTakeFirstOrThrow()
    ).evidence as { quotes: string[]; timestamps: string[] };
    expect(stored).toEqual({
      quotes: ["a line from the amended week"],
      timestamps: ["21:15"],
    });
    const second = await amend.amend({
      reportId: REPORT,
      amendment: { body: { headline: "A steady session, revised" } },
      byUserId: null,
    });
    expect(second.applied).toBe(true);
    expect(second.revision).toBe(2);
  });

  it("a key moment quote this leader used in another report still blocks the revision", async () => {
    await seed({
      keyMoments: [
        { quote: "a quote from an earlier week", timestamp: "30:00" },
      ],
    });
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
      amendment: { body: { headline: "A steady session, revised" } },
      byUserId: null,
    });
    expect(result.refusal).toBe("governance-blocked");
    expect(result.violations?.map((v) => v.rule)).toContain("reused-quote");
    expect(
      result.violations?.find((v) => v.rule === "reused-quote")?.detail,
    ).toContain("amend-earlier");
  });

  it("A revision changes the email's highlights: the revised email carries the amended strength", async () => {
    await seed();
    const mailer = new FakeMailer();
    const result = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: {
        body: {
          strengths: ["Scripture before opinion, every time"],
          strengthsProse: [
            {
              title: "Scripture before opinion, every time",
              paragraphs: [
                "The group read each passage before anyone gave a view.",
              ],
            },
          ],
        },
      },
      byUserId: null,
    });
    expect(result.sent).toBe(true);
    expect(mailer.sent.length).toBe(3);
    for (const sent of mailer.sent) {
      expect(sent.html).toContain(
        "<strong>Scripture before opinion, every time</strong>",
      );
      expect(sent.html).toContain(
        "The group read each passage before anyone gave a view.",
      );
      expect(sent.html).not.toContain("Scripture first<");
    }
  });

  it("An amendment breaks a governance rule through the email: a session title naming the benchmark leader holds the revision", async () => {
    await seed();
    await conn
      .updateTable("coach_reports")
      .set({
        summary: JSON.stringify({
          session: "Jonah with Avery Hollis",
          score: 80,
          status: "Strong",
        }),
      })
      .where("id", "=", REPORT)
      .execute();
    const mailer = new FakeMailer();
    const result = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: { body: { headline: "A steady session, revised" } },
      byUserId: null,
    });
    expect(result.refusal).toBe("governance-blocked");
    expect(result.violations?.map((v) => v.rule)).toEqual(["benchmark-name"]);
    expect(mailer.sent).toEqual([]);
  });

  it("A rationale quote is not compared: an amended rationale quoting another report's evidence is not blocked", async () => {
    await seed();
    await seed({
      id: "amend-earlier",
      keyMoments: [{ quote: "an earlier key moment", timestamp: "05:00" }],
    });
    await conn
      .updateTable("coach_reports")
      .set({
        evidence: JSON.stringify({
          quotes: ["a quote from an earlier week"],
          timestamps: ["21:15"],
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
          {
            n: 6,
            score: 3,
            rationale: 'said "a quote from an earlier week" at 21:15',
          },
        ],
      },
      byUserId: null,
    });
    expect(result.applied).toBe(true);
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

  it("A first lesson drops the Big Ideas review row: setting the flag on a delivered report removes it in the revision", async () => {
    await seed();
    const body = (await row()).body as Record<string, unknown>;
    await conn
      .updateTable("coach_reports")
      .set({
        body: JSON.stringify({
          ...body,
          sections: [
            {
              title: "Scorecard — Table 3",
              bullets: [
                "Overall Class Time: 1h 40m  (Target: 1.5-2h)  → ON TARGET",
                "Big Ideas review at open: 6 min (6%)  (Target: 5-10 min)  → ON TARGET",
              ],
            },
          ],
        }),
      })
      .where("id", "=", REPORT)
      .execute();
    const mailer = new FakeMailer();
    const set = await new CoachService(Database, mailer).setFirstLesson({
      reportId: REPORT,
      firstLesson: true,
      byUserId: null,
    });
    expect(set.applied).toBe(true);
    const sections = (
      (await row()).body as { sections: Array<{ bullets: string[] }> }
    ).sections;
    expect(sections.flatMap((s) => s.bullets)).toEqual([
      "Overall Class Time: 1h 40m  (Target: 1.5-2h)  → ON TARGET",
    ]);
  });

  it("an amended list replaces its prose too, so the portal and the reminder show what the admin wrote", async () => {
    await seed({
      improvementsProse: [
        { title: "Quiet members", paragraphs: ["Call on them by name."] },
      ],
    });
    const amend = new CoachAmendService(Database, new FakeMailer());
    const cleared = await amend.amend({
      reportId: REPORT,
      amendment: {
        body: { improvements: ["Give newcomers a first question"] },
      },
      byUserId: null,
    });
    expect(cleared.applied).toBe(true);
    let feedback = ((await row()).body as { feedback: Record<string, unknown> })
      .feedback;
    expect(feedback.improvements).toEqual(["Give newcomers a first question"]);
    expect(feedback.improvementsProse).toBeUndefined();
    expect(feedback.strengthsProse).toEqual([
      { title: "Scripture first", paragraphs: ["Read before discussing."] },
    ]);

    const prose = [
      {
        title: "Newcomers",
        paragraphs: ["Give each newcomer a first question."],
      },
    ];
    const edited = await amend.amend({
      reportId: REPORT,
      amendment: {
        body: {
          improvements: ["Give newcomers a first question"],
          improvementsProse: prose,
        },
      },
      byUserId: null,
    });
    expect(edited.applied).toBe(true);
    feedback = ((await row()).body as { feedback: Record<string, unknown> })
      .feedback;
    expect(feedback.improvementsProse).toEqual(prose);
  });

  it("a list amended without its prose records the cleared prose in the revision, and the kept versions show it", async () => {
    const stored = [
      { title: "Quiet members", paragraphs: ["Call on them by name."] },
    ];
    await seed({ improvementsProse: stored });
    const amended = await new CoachAmendService(
      Database,
      new FakeMailer(),
    ).amend({
      reportId: REPORT,
      amendment: {
        body: {
          improvements: ["Give newcomers a first question"],
          strengths: ["Scripture first", "Warm welcome"],
        },
      },
      byUserId: null,
    });
    expect(amended.applied).toBe(true);
    const [revision] = await new CoachService(Database).listRevisions(REPORT);
    expect(revision.changes.body).toEqual({
      improvements: {
        from: ["Call on quiet members"],
        to: ["Give newcomers a first question"],
      },
      strengths: {
        from: ["Scripture first"],
        to: ["Scripture first", "Warm welcome"],
      },
      improvementsProse: { from: stored, to: null },
      strengthsProse: {
        from: [
          { title: "Scripture first", paragraphs: ["Read before discussing."] },
        ],
        to: null,
      },
    });
  });

  it("a cold-recall item in the improvement prose holds a first lesson's amendment", async () => {
    await seed({
      firstLesson: true,
      improvementsProse: [
        {
          title: "No recap",
          paragraphs: ["Reserve a 60-second cold-recall drill at the open."],
        },
      ],
    });
    const mailer = new FakeMailer();
    const result = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: { body: { headline: "A new study" } },
      byUserId: null,
    });
    expect(result.refusal).toBe("cold-recall-improvement");
    expect(ours(mailer)).toEqual([]);
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

    const withoutRow = await service.setFirstLesson({
      reportId: REPORT,
      firstLesson: false,
      score: 3,
      rationale: "opened with last week's big ideas",
      byUserId: null,
    });
    expect(withoutRow.refusal).toBe("big-ideas-review-required");
    expect((await row()).first_lesson).toBe(true);
    expect(ours(mailer)).toEqual([]);

    const cleared = await service.setFirstLesson({
      reportId: REPORT,
      firstLesson: false,
      score: 3,
      rationale: "opened with last week's big ideas",
      bigIdeasReview: { value: "5 min (6%)", rating: "ON TARGET" },
      byUserId: null,
    });
    expect(cleared.applied).toBe(true);
    const sections = (
      (await row()).body as { sections: Array<{ bullets: string[] }> }
    ).sections;
    expect(sections.flatMap((s) => s.bullets)).toContain(
      "Big Ideas review at open: 5 min (6%)  (Target: 5-10 min)  → ON TARGET",
    );
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

  it("an amendment whose revision another request's send already mailed reports it sent", async () => {
    await seed();
    const mailer = new FakeMailer();
    const send = CoachDeliveryService.prototype.sendRevision;
    const raced = spyOn(
      CoachDeliveryService.prototype,
      "sendRevision",
    ).mockImplementationOnce(async function (
      this: CoachDeliveryService,
      reportId: string,
    ) {
      await send.call(this, reportId);
      return send.call(this, reportId);
    });
    try {
      const result = await new CoachAmendService(Database, mailer).amend({
        reportId: REPORT,
        amendment: { body: { headline: "revised" } },
        byUserId: null,
      });
      expect(result).toMatchObject({ applied: true, revision: 1, sent: true });
      expect(result.pending).toBeUndefined();
      expect(ours(mailer).length).toBe(3);
    } finally {
      raced.mockRestore();
    }
  });

  it("an amendment that changes nothing is refused and stores no revision", async () => {
    await seed();
    const amend = new CoachAmendService(Database, new FakeMailer());
    for (const amendment of [{}, { body: {} }, { dimensions: [] }])
      expect(
        (await amend.amend({ reportId: REPORT, amendment, byUserId: null }))
          .refusal,
      ).toBe("empty-amendment");
    expect(await new CoachService(Database).listRevisions(REPORT)).toEqual([]);
  });

  it("a report already flagged a first lesson refuses an amendment that adds a cold-recall improvement", async () => {
    await seed({ firstLesson: true });
    const mailer = new FakeMailer();
    const result = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: {
        body: { improvements: ["Open with a recap of last week's big ideas"] },
      },
      byUserId: null,
    });
    expect(result.refusal).toBe("cold-recall-improvement");
    expect(ours(mailer)).toEqual([]);
  });

  it.each([
    ["no score", { n: 9, score: null, rationale: "opened with a recap" }],
    ["a blank rationale", { n: 9, score: 3, rationale: "   " }],
  ])(
    "clearing the flag through an amendment with %s is refused",
    async (_, dimension) => {
      await seed({ firstLesson: true });
      const result = await new CoachAmendService(
        Database,
        new FakeMailer(),
      ).amend({
        reportId: REPORT,
        amendment: { firstLesson: false, dimensions: [dimension] },
        byUserId: null,
      });
      expect(result.refusal).toBe("memory-reinforcement-required");
      expect((await row()).first_lesson).toBe(true);
    },
  );

  it("setting the flag makes dimension 9 not applicable even when the amendment scores it", async () => {
    await seed();
    const result = await new CoachAmendService(
      Database,
      new FakeMailer(),
    ).amend({
      reportId: REPORT,
      amendment: {
        firstLesson: true,
        dimensions: [{ n: 9, score: 4, rationale: "a new study: Amos" }],
      },
      byUserId: null,
    });
    expect(result.applied).toBe(true);
    expect(await dimension(9)).toEqual({
      score: null,
      rationale: "a new study: Amos",
      provenance: "human",
    });
  });

  it("with no mailer the revision is stored and reported pending, not sent", async () => {
    await seed();
    const result = await new CoachAmendService(Database, null).amend({
      reportId: REPORT,
      amendment: { body: { headline: "revised" } },
      byUserId: null,
    });
    expect(result).toMatchObject({
      applied: true,
      sent: false,
      pending: "no-mailer",
    });
    const [revision] = await new CoachService(Database).listRevisions(REPORT);
    expect(revision).toMatchObject({ kind: "revision", sentAt: null });
  });

  it.each(["in-flight", "not-live"] as const)(
    "a send refused as %s is reported as that pending reason",
    async (refusal) => {
      await seed();
      const refused = spyOn(
        CoachDeliveryService.prototype,
        "sendRevision",
      ).mockResolvedValueOnce({ sent: false, refusal, revision: 1 });
      try {
        const result = await new CoachAmendService(
          Database,
          new FakeMailer(),
        ).amend({
          reportId: REPORT,
          amendment: { body: { headline: "revised" } },
          byUserId: null,
        });
        expect(result).toMatchObject({
          applied: true,
          sent: false,
          pending: refusal,
        });
      } finally {
        refused.mockRestore();
      }
    },
  );

  it("the revisions list names the admin who amended by email, and no one when unknown", async () => {
    await seed();
    const adminEmail = "amend-who@example.test";
    const adminId = (
      await conn
        .insertInto("user")
        .values({
          email: adminEmail,
          firstName: "A",
          lastName: "W",
          emailVerified: true,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    try {
      const service = new CoachService(Database, new FakeMailer());
      await service.amendReport({
        reportId: REPORT,
        amendment: { body: { headline: "first" } },
        byUserId: adminId,
      });
      await service.amendReport({
        reportId: REPORT,
        amendment: { body: { headline: "second" } },
        byUserId: null,
      });
      const [unknown, known] = await service.listRevisions(REPORT);
      expect(known).toMatchObject({ kind: "revision", amendedBy: adminEmail });
      expect(unknown).toMatchObject({ kind: "revision", amendedBy: null });
    } finally {
      await conn.deleteFrom("user").where("id", "=", adminId).execute();
    }
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

describe("a revision is sent only while its report is live for the leader it was made for", () => {
  beforeEach(async () => {
    await clear();
    await seedPeople();
    await seed();
    await new CoachAmendService(Database, new FakeMailer()).amend({
      reportId: REPORT,
      amendment: { body: { headline: "revised in the parallel run" } },
      byUserId: null,
    });
  });
  afterEach(async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    await clear();
  });

  const send = (mailer: FakeMailer) =>
    new CoachDeliveryService(Database, mailer).sendRevision(REPORT);

  it("amended in the parallel run, re-attributed, then sent after cutover: refused", async () => {
    expect(
      await reattributeSession(Database, `ff-${REPORT}`, OTHER, LEADER),
    ).toMatchObject({ ok: true });
    process.env[COACH_PIPELINE_LIVE] = "true";
    const mailer = new FakeMailer();
    expect((await send(mailer)).refusal).toBe("not-live");
    expect(ours(mailer)).toEqual([]);
  });

  it("still refused once the re-attributed report is delivered to its new leader", async () => {
    await reattributeSession(Database, `ff-${REPORT}`, OTHER, LEADER);
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivered" })
      .where("report_id", "=", REPORT)
      .execute();
    await conn
      .updateTable("coach_reports")
      .set({ held: false })
      .where("id", "=", REPORT)
      .execute();
    process.env[COACH_PIPELINE_LIVE] = "true";
    const mailer = new FakeMailer();
    expect((await send(mailer)).refusal).toBe("not-live");
    expect(ours(mailer)).toEqual([]);
  });

  it("refused while the report is held from its leader", async () => {
    await conn
      .updateTable("coach_reports")
      .set({ held: true })
      .where("id", "=", REPORT)
      .execute();
    process.env[COACH_PIPELINE_LIVE] = "true";
    const mailer = new FakeMailer();
    expect((await send(mailer)).refusal).toBe("not-live");
    expect(ours(mailer)).toEqual([]);
  });

  it("refused while the session is not delivered", async () => {
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivery_pending" })
      .where("report_id", "=", REPORT)
      .execute();
    process.env[COACH_PIPELINE_LIVE] = "true";
    const mailer = new FakeMailer();
    expect((await send(mailer)).refusal).toBe("not-live");
    expect(ours(mailer)).toEqual([]);
  });

  it("a report re-attributed while its revision is being sent stops the send", async () => {
    process.env[COACH_PIPELINE_LIVE] = "true";
    let moved = false;
    class MovingMailer extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        const result = await super.sendEmail(data);
        if (!moved) {
          moved = true;
          await reattributeSession(Database, `ff-${REPORT}`, OTHER, LEADER);
        }
        return result;
      }
    }
    const mailer = new MovingMailer();
    const result = await send(mailer);
    expect(result.sent).toBe(false);
    expect(ours(mailer).length).toBe(1);
  });
});

describe("a revision is claimed before it is sent", () => {
  beforeEach(async () => {
    await clear();
    await seedPeople();
    await seed();
    await new CoachAmendService(Database, new FakeMailer()).amend({
      reportId: REPORT,
      amendment: { body: { headline: "revised before cutover" } },
      byUserId: null,
    });
    process.env[COACH_PIPELINE_LIVE] = "true";
  });
  afterEach(async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    await clear();
  });

  class GatedMailer extends FakeMailer {
    reached: Promise<void>;
    private arrive = () => {};
    private open = () => {};
    private readonly gate: Promise<void>;
    constructor(private readonly atSend = 1) {
      super();
      this.reached = new Promise((resolve) => {
        this.arrive = resolve;
      });
      this.gate = new Promise((resolve) => {
        this.open = resolve;
      });
    }
    release() {
      this.open();
    }
    override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
      const result = await super.sendEmail(data);
      if (this.sent.length === this.atSend) {
        this.arrive();
        await this.gate;
      }
      return result;
    }
  }

  const staleClaim = () =>
    conn
      .updateTable("coach_report_amendments")
      .set({ sending_at: sql`NOW() - interval '20 minutes'` })
      .where("report_id", "=", REPORT)
      .execute();

  const copies = (...mailers: FakeMailer[]) => {
    const received = new Map<string, number>();
    for (const m of mailers)
      for (const s of ours(m))
        received.set(s.to, (received.get(s.to) ?? 0) + 1);
    return received;
  };

  it("a send while another holds a live claim is refused and mails nobody", async () => {
    const holder = new GatedMailer();
    const first = new CoachDeliveryService(Database, holder).sendRevision(
      REPORT,
    );
    await holder.reached;
    const second = new FakeMailer();
    const refused = await new CoachDeliveryService(
      Database,
      second,
    ).sendRevision(REPORT);
    expect(refused).toMatchObject({ sent: false, refusal: "in-flight" });
    expect(second.sent).toEqual([]);
    holder.release();
    expect((await first).sent).toBe(true);
    expect([...copies(holder).values()]).toEqual([1, 1, 1]);
  });

  it("a stalled sender that resumes while the rescuer is sending cannot renew the rescuer's claim, and no send repeats", async () => {
    const rescuer = new GatedMailer();
    let rescued: Promise<{ sent: boolean }> | null = null;
    class StallsOnce extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        const result = await super.sendEmail(data);
        if (rescued === null) {
          await staleClaim();
          rescued = new CoachDeliveryService(Database, rescuer).sendRevision(
            REPORT,
          );
          await rescuer.reached;
        }
        return result;
      }
    }
    const stalled = new StallsOnce();
    const first = await new CoachDeliveryService(
      Database,
      stalled,
    ).sendRevision(REPORT);
    expect(first).toMatchObject({ sent: false, refusal: "in-flight" });
    expect(ours(stalled)).toHaveLength(1);
    rescuer.release();
    expect(
      (await (rescued as unknown as Promise<{ sent: boolean }>)).sent,
    ).toBe(true);
    const received = copies(stalled, rescuer);
    expect([...received.keys()].sort()).toEqual([...EMAILS].sort());
    for (const [, n] of received) expect(n).toBe(1);
  });

  it("a stalled sender that resumes after its last send cannot release the rescuer's claim or mark the revision sent", async () => {
    const recipients = EMAILS.length;
    class StallsOnLast extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        const result = await super.sendEmail(data);
        if (this.sent.length === recipients)
          await conn
            .updateTable("coach_report_amendments")
            .set({ sending_at: sql`clock_timestamp() + interval '1 second'` })
            .where("report_id", "=", REPORT)
            .execute();
        return result;
      }
    }
    const stalled = new StallsOnLast();
    const first = await new CoachDeliveryService(
      Database,
      stalled,
    ).sendRevision(REPORT);
    expect(first).toMatchObject({ sent: false, refusal: "in-flight" });
    const pending = await conn
      .selectFrom("coach_report_amendments")
      .select(["sent_at", "sending_at", "sent_to"])
      .where("report_id", "=", REPORT)
      .executeTakeFirstOrThrow();
    expect(pending.sent_at).toBeNull();
    expect(pending.sending_at).not.toBeNull();
    for (const email of EMAILS) expect(pending.sent_to).toContain(email);

    await staleClaim();
    const last = new FakeMailer();
    const settled = await new CoachDeliveryService(Database, last).sendRevision(
      REPORT,
    );
    expect(settled.sent).toBe(true);
    expect(last.sent).toEqual([]);
  });

  it("a send that stalls past the claim window is fenced off, no send repeats, and its late confirmation still counts", async () => {
    const rescuer = new FakeMailer();
    let rescued: Promise<unknown> | null = null;
    class StallingMailer extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        const result = await super.sendEmail(data);
        if (rescued === null) {
          await conn
            .updateTable("coach_report_amendments")
            .set({ sending_at: sql`NOW() - interval '20 minutes'` })
            .where("report_id", "=", REPORT)
            .execute();
          rescued = new CoachDeliveryService(Database, rescuer).sendRevision(
            REPORT,
          );
          await rescued;
        }
        return result;
      }
    }
    const stalled = new StallingMailer();
    const first = await new CoachDeliveryService(
      Database,
      stalled,
    ).sendRevision(REPORT);

    expect(first.sent).toBe(false);
    expect(first.refusal).toBe("in-flight");
    const received = copies(stalled, rescuer);
    expect([...received.keys()].sort()).toEqual([...EMAILS].sort());
    for (const [, n] of received) expect(n).toBe(1);

    const last = new FakeMailer();
    const settled = await new CoachDeliveryService(Database, last).sendRevision(
      REPORT,
    );
    expect(settled.sent).toBe(true);
    expect(last.sent).toEqual([]);
  });

  it("a stalled sender's failed send cannot clear the attempt the sender now holding the claim recorded", async () => {
    let takenOver: string | null = null;
    class TakenDuringFailedSend extends FakeMailer {
      override async sendEmail(data: Parameters<FakeMailer["sendEmail"]>[0]) {
        const result = await super.sendEmail(data);
        const taken = await conn
          .updateTable("coach_report_amendments")
          .set({
            sending_at: sql`clock_timestamp() + interval '1 second'`,
            attempted_to: sql`ARRAY[${LEADER_EMAIL}]::text[]`,
          })
          .where("report_id", "=", REPORT)
          .returning(sql<string>`sending_at::text`.as("token"))
          .executeTakeFirstOrThrow();
        takenOver = taken.token;
        return result;
      }
    }
    const result = await new CoachDeliveryService(
      Database,
      new TakenDuringFailedSend((to) => to === LEADER_EMAIL),
    ).sendRevision(REPORT);
    expect(result).toMatchObject({ sent: false, refusal: "in-flight" });
    const pending = await conn
      .selectFrom("coach_report_amendments")
      .select(["attempted_to", sql<string>`sending_at::text`.as("token")])
      .where("report_id", "=", REPORT)
      .executeTakeFirstOrThrow();
    expect(pending).toEqual({
      attempted_to: [LEADER_EMAIL],
      token: takenOver as unknown as string,
    });
  });

  it("a send that crashed holds the revision only until its claim is stale", async () => {
    const claimedAt = async (age: string) =>
      conn
        .updateTable("coach_report_amendments")
        .set({ sending_at: sql`NOW() - ${sql.raw(`interval '${age}'`)}` })
        .where("report_id", "=", REPORT)
        .execute();
    const mailer = new FakeMailer();

    await claimedAt("1 minute");
    const busy = await new CoachDeliveryService(Database, mailer).sendRevision(
      REPORT,
    );
    expect(busy.refusal).toBe("in-flight");
    expect(ours(mailer)).toEqual([]);

    await claimedAt("1 day");
    const retried = await new CoachDeliveryService(
      Database,
      mailer,
    ).sendRevision(REPORT);
    expect(retried.sent).toBe(true);
    expect(ours(mailer).length).toBe(3);
  });

  it("a crash after an accepted send and before it is recorded: that recipient is not mailed the revision again until it is requeued", async () => {
    const dying = new GatedMailer();
    void new CoachDeliveryService(Database, dying).sendRevision(REPORT);
    await dying.reached;
    const accepted = ours(dying)[0].to;
    await staleClaim();

    const next = new FakeMailer();
    const result = await new CoachDeliveryService(Database, next).sendRevision(
      REPORT,
    );
    expect(result).toMatchObject({ sent: false, refusal: "send-failed" });
    const resent = ours(next).map((s) => s.to);
    expect(resent).not.toContain(accepted);
    expect(resent.sort()).toEqual(EMAILS.filter((e) => e !== accepted).sort());
    const unconfirmed = result.sends?.find((s) => s.email === accepted);
    expect(unconfirmed?.delivered).toBe(false);
    expect(unconfirmed?.error).toContain("requeue");
    expect(unconfirmed?.neverConfirmed).toBe(true);
    expect(
      result.sends
        ?.filter((s) => s.email !== accepted)
        .map((s) => s.neverConfirmed),
    ).toEqual([undefined, undefined]);
    const [latest] = (
      await new CoachService(Database).listRevisions(REPORT)
    ).filter((r) => r.kind === "revision");
    expect(latest).toMatchObject({ attemptedTo: [accepted], sentAt: null });

    const idle = new FakeMailer();
    expect(
      (await new CoachDeliveryService(Database, idle).sendRevision(REPORT))
        .sent,
    ).toBe(false);
    expect(ours(idle)).toEqual([]);

    const service = new CoachService(Database);
    expect(await service.requeueRevision(REPORT)).toBe(true);
    const requeued = new FakeMailer();
    const done = await new CoachDeliveryService(
      Database,
      requeued,
    ).sendRevision(REPORT);
    expect(done.sent).toBe(true);
    expect(ours(requeued).map((s) => s.to)).toEqual([accepted]);
    expect(await service.requeueRevision(REPORT)).toBe(false);
    const [sent] = (await service.listRevisions(REPORT)).filter(
      (r) => r.kind === "revision",
    );
    expect(sent).toMatchObject({ attemptedTo: [] });
  });

  it("an amendment while a revision's send is live is refused, so no two revised copies go out", async () => {
    const sending = new GatedMailer();
    const send = new CoachDeliveryService(Database, sending).sendRevision(
      REPORT,
    );
    await sending.reached;
    const mailer = new FakeMailer();
    const refused = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: { body: { headline: "revised while sending" } },
      byUserId: null,
    });
    expect(refused).toEqual({ applied: false, refusal: "revision-sending" });
    expect(ours(mailer)).toEqual([]);
    sending.release();
    expect((await send).sent).toBe(true);
    const after = await new CoachAmendService(Database, mailer).amend({
      reportId: REPORT,
      amendment: { body: { headline: "revised after the send" } },
      byUserId: null,
    });
    expect(after).toMatchObject({ applied: true, revision: 2 });
  });

  it("only the latest unsent revision lists its never-confirmed recipients", async () => {
    const dying = new GatedMailer();
    void new CoachDeliveryService(Database, dying).sendRevision(REPORT);
    await dying.reached;
    await staleClaim();
    const newer = await new CoachAmendService(Database, null).amend({
      reportId: REPORT,
      amendment: { body: { headline: "revised again" } },
      byUserId: null,
    });
    expect(newer).toMatchObject({ applied: true, revision: 2 });
    const listed = (await new CoachService(Database).listRevisions(REPORT))
      .filter((r) => r.kind === "revision")
      .map((r) => (r.kind === "revision" ? [r.revision, r.attemptedTo] : []));
    expect(listed).toEqual([
      [2, []],
      [1, []],
    ]);
  });

  it("a requeue never clears the marker of a send whose claim is still live", async () => {
    const dying = new GatedMailer();
    void new CoachDeliveryService(Database, dying).sendRevision(REPORT);
    await dying.reached;
    expect(await new CoachService(Database).requeueRevision(REPORT)).toBe(
      false,
    );
  });

  it("a crash right after an accepted send is recorded: the next send mails only the recipients still owed", async () => {
    const first = new FakeMailer();
    const crashing = new CoachDeliveryService(Database, first);
    const internals = crashing as unknown as {
      recordRevisionRecipient: (...args: unknown[]) => Promise<boolean>;
    };
    const record = internals.recordRevisionRecipient.bind(crashing);
    internals.recordRevisionRecipient = async (...args: unknown[]) => {
      await record(...args);
      throw new Error("connection lost");
    };
    await expect(crashing.sendRevision(REPORT)).rejects.toThrow(
      "connection lost",
    );
    const recorded = ours(first)[0].to;
    await staleClaim();

    const next = new FakeMailer();
    const result = await new CoachDeliveryService(Database, next).sendRevision(
      REPORT,
    );
    expect(result.sent).toBe(true);
    expect(
      ours(next)
        .map((s) => s.to)
        .sort(),
    ).toEqual(EMAILS.filter((e) => e !== recorded).sort());
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
