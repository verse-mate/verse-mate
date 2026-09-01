import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import {
  CoachGovernanceService,
  type ReportEvidence,
  checkBenchmarkName,
  checkEvidenceReuse,
} from "./coach-governance.service";

const conn = Database.getOrCreateConnection();
const BENCH = "gov-bench";
const OTHER = "gov-other";
const EMAILS = ["gov-bench@example.test", "gov-other@example.test"];

const svc = new CoachGovernanceService(Database);

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
      {
        slug: BENCH,
        email: EMAILS[0],
        name: "Bryan Bailey",
        is_benchmark: true,
      },
      { slug: OTHER, email: EMAILS[1], name: "Jeff Ward" },
    ])
    .execute();
}

async function seedReport(
  coachId: string,
  id: string,
  ev: ReportEvidence | null,
  date = "2026-08-22",
) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: coachId,
      session_date: date,
      source_session_id: `ff-${id}`,
      legacy_ids: [],
      summary: {},
      metrics: {},
      body: {},
      evidence: ev,
    })
    .execute();
}

async function clear() {
  for (const c of [BENCH, OTHER]) {
    await conn.deleteFrom("coach_reports").where("coach_id", "=", c).execute();
  }
  await conn
    .deleteFrom("coach_leaders")
    .where("is_benchmark", "=", true)
    .where("email", "in", EMAILS)
    .execute();
  await conn.deleteFrom("coach_leaders").where("email", "in", EMAILS).execute();
}

describe("rule 1 — the benchmark leader's name", () => {
  it("leaking into ANOTHER leader's report is a violation", () => {
    const v = checkBenchmarkName({
      reportCoachId: OTHER,
      benchmarkCoachId: BENCH,
      benchmarkName: "Bryan Bailey",
      body: "Unlike Bryan Bailey, the pacing here was uneven.",
    });
    expect(v.length).toBe(1);
    expect(v[0].rule).toBe("benchmark-name");
  });

  it("HIS OWN report is not blocked — comparison to his history is the point", () => {
    const v = checkBenchmarkName({
      reportCoachId: BENCH,
      benchmarkCoachId: BENCH,
      benchmarkName: "Bryan Bailey",
      body: "Bryan Bailey's opening recall was stronger than in July.",
    });
    expect(v).toEqual([]);
  });

  it("he ATTENDED another leader's session — his name still appears NOWHERE in it", () => {
    // Open question 4 is answered: attendance is a count, never names. There is
    // no appendix attendee list for the name to sit in, so the rule is
    // unconditional outside his own reports, and delivery proceeds precisely
    // because the name is absent.
    const v = checkBenchmarkName({
      reportCoachId: OTHER,
      benchmarkCoachId: BENCH,
      benchmarkName: "Bryan Bailey",
      body: "Twelve attended, including one newcomer. Pacing was steady.",
    });
    expect(v).toEqual([]);
  });

  it("matching ignores case", () => {
    const v = checkBenchmarkName({
      reportCoachId: OTHER,
      benchmarkCoachId: BENCH,
      benchmarkName: "Bryan Bailey",
      body: "compare with BRYAN BAILEY here",
    });
    expect(v.length).toBe(1);
  });

  it("no benchmark leader configured means no rule to break", () => {
    expect(
      checkBenchmarkName({
        reportCoachId: OTHER,
        benchmarkCoachId: null,
        benchmarkName: null,
        body: "anything",
      }),
    ).toEqual([]);
  });
});

describe("rule 2 — no quote or timestamp reused by one leader", () => {
  it("catches a reused quote", () => {
    const v = checkEvidenceReuse(evidence(["the LORD is my shepherd"]), [
      evidence(["the LORD is my shepherd"]),
    ]);
    expect(v.length).toBe(1);
    expect(v[0].rule).toBe("reused-quote");
  });

  it("normalizes whitespace and case, and says that is the limit", () => {
    const v = checkEvidenceReuse(evidence(["  The LORD   is my Shepherd "]), [
      evidence(["the lord is my shepherd"]),
    ]);
    expect(v.length).toBe(1);
  });

  it("does NOT claim to catch a re-punctuated quote — a stated limit", () => {
    // A similarity threshold nobody has calibrated would block a leader's
    // report on a judgement call, which is worse than a narrow rule.
    const v = checkEvidenceReuse(evidence(['"The LORD is my shepherd."']), [
      evidence(["the LORD is my shepherd"]),
    ]);
    expect(v).toEqual([]);
  });

  it("catches a reused timestamp, compared EXACTLY", () => {
    expect(
      checkEvidenceReuse(evidence([], ["00:12:30"]), [
        evidence([], ["00:12:30"]),
      ]).length,
    ).toBe(1);
    // Not an overlapping range: two genuinely different moments in the same
    // minute are not the same citation.
    expect(
      checkEvidenceReuse(evidence([], ["00:12:31"]), [
        evidence([], ["00:12:30"]),
      ]),
    ).toEqual([]);
  });

  it("a report with fresh evidence passes", () => {
    expect(
      checkEvidenceReuse(evidence(["a new quote"], ["00:01:00"]), [
        evidence(["an old quote"], ["00:02:00"]),
      ]),
    ).toEqual([]);
  });
});

describe("the check runs against what is persisted", () => {
  beforeEach(async () => {
    await clear();
    await seedLeaders();
  });
  afterEach(clear);

  it("a report that breaks neither rule passes", async () => {
    await seedReport(OTHER, "r1", null);
    const verdict = await svc.check({
      reportId: "r1",
      coachId: OTHER,
      body: "Steady pacing and good participation.",
      evidence: evidence(["something fresh"], ["00:03:00"]),
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.violations).toEqual([]);
  });

  it("THE FIRST report after cutover is never blocked by rule 2", async () => {
    // The comparison set starts EMPTY, deliberately unseeded: no backfilled
    // report carries a quote field and only a minority carry a structured
    // timestamp, so seeding would enforce the rule hard on some leaders and
    // not at all on others.
    await seedReport(OTHER, "backfilled-1", null, "2026-01-10");
    await seedReport(OTHER, "backfilled-2", null, "2026-02-10");
    await seedReport(OTHER, "first-after-cutover", null);

    const verdict = await svc.check({
      reportId: "first-after-cutover",
      coachId: OTHER,
      body: "clean",
      evidence: evidence(["any quote at all"], ["00:00:10"]),
    });
    expect(verdict.passed).toBe(true);
  });

  it("a pre-cutover report contributes NOTHING, however rich its prose", async () => {
    // The seeding boundary, made testable. "Starts empty" holds because
    // backfilled reports have a NULL evidence column — not because of prose
    // they do or do not contain. A future change that mined quotes out of a
    // report BODY would seed the set unevenly, hard on the leaders whose old
    // reports happen to carry material and not at all on the rest. This is the
    // assertion that would catch it.
    await conn
      .insertInto("coach_reports")
      .values({
        id: "prose-rich",
        coach_id: OTHER,
        session_date: "2026-01-10",
        source_session_id: "ff-prose-rich",
        legacy_ids: [],
        summary: { session: "the LORD is my shepherd" },
        metrics: {},
        body: {
          bigIdeas: ["the LORD is my shepherd"],
          feedback: { headline: "quoted the LORD is my shepherd at 00:04:00" },
        },
        evidence: null,
      })
      .execute();
    await seedReport(OTHER, "candidate", null);

    const verdict = await svc.check({
      reportId: "candidate",
      coachId: OTHER,
      body: "clean",
      evidence: evidence(["the LORD is my shepherd"], ["00:04:00"]),
    });
    expect(verdict.passed).toBe(true);
  });

  it("a quote reused across two POST-CUTOVER reports is caught", async () => {
    await seedReport(OTHER, "earlier", evidence(["a memorable line"]));
    await seedReport(OTHER, "later", null);

    const verdict = await svc.check({
      reportId: "later",
      coachId: OTHER,
      body: "clean",
      evidence: evidence(["a memorable line"]),
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations[0].rule).toBe("reused-quote");
  });

  it("reuse is scoped to ONE leader — two leaders may cite the same verse", async () => {
    await seedReport(BENCH, "bench-1", evidence(["the LORD is my shepherd"]));
    await seedReport(OTHER, "other-1", null);

    const verdict = await svc.check({
      reportId: "other-1",
      coachId: OTHER,
      body: "clean",
      evidence: evidence(["the LORD is my shepherd"]),
    });
    expect(verdict.passed).toBe(true);
  });

  it("recording evidence is what puts a report INTO the comparison set", async () => {
    await seedReport(OTHER, "earlier", null);
    await seedReport(OTHER, "later", null);

    // Before recording: the earlier report is invisible to the rule.
    expect(
      (
        await svc.check({
          reportId: "later",
          coachId: OTHER,
          body: "clean",
          evidence: evidence(["shared line"]),
        })
      ).passed,
    ).toBe(true);

    await svc.recordEvidence("earlier", evidence(["shared line"]));

    expect(
      (
        await svc.check({
          reportId: "later",
          coachId: OTHER,
          body: "clean",
          evidence: evidence(["shared line"]),
        })
      ).passed,
    ).toBe(false);
  });

  it("the benchmark leader's name in another leader's report is caught end to end", async () => {
    await seedReport(OTHER, "r1", null);
    const verdict = await svc.check({
      reportId: "r1",
      coachId: OTHER,
      body: "Not yet at Bryan Bailey's level of preparation.",
      evidence: evidence(),
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations[0].rule).toBe("benchmark-name");
  });
});
