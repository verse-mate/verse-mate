import { afterEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import {
  type Agreement,
  type HandScoredReport,
  MIN_CALIBRATION_LEADERS,
  MIN_CALIBRATION_REPORTS,
  MIN_GATED_LEADER_REPORTS,
  type MachineScoring,
  TOLERANCE_COMPOSITE_MAE,
  TOLERANCE_DIMENSIONS_WITHIN_ONE,
  calibrationShortfalls,
  checkCalibration,
  checkTolerance,
  measureAgreement,
  recordCalibration,
  replayOrder,
  selectEligible,
} from "./coach-calibration";
import coachDataJson from "./coach.data.json";
import { DIMENSIONS } from "./rubric";

function report(
  coachId: string,
  reportId: string,
  date: string,
  score: number | null,
  rationale = "a real reason",
): HandScoredReport {
  return {
    coachId,
    reportId,
    date,
    dimensions: DIMENSIONS.map((d) => ({ n: d.n, score, rationale })),
  };
}

function machine(reportId: string, score: number | null): MachineScoring {
  return {
    reportId,
    dimensions: new Map(DIMENSIONS.map((d) => [d.n, score])),
  };
}

describe("eligibility is an explicit filter, and its count is derived", () => {
  it("excludes a report with no rationale on ANY dimension", () => {
    // That is what a mechanical .docx reconstruction looks like in the data,
    // and it is exactly the unknown-provenance case: the numbers exist, but
    // nothing records what produced them, so agreeing with them proves nothing.
    const result = selectEligible([
      report("a", "good", "2026-01-01", 4),
      report("a", "reconstructed", "2026-01-08", 4, "   "),
    ]);
    expect(result.eligible.map((r) => r.reportId)).toEqual(["good"]);
    expect(result.excluded).toEqual([
      {
        reportId: "reconstructed",
        coachId: "a",
        reason: "no-rationale-anywhere",
      },
    ]);
  });

  it("counts the empty-rationale share rather than asserting it", () => {
    const result = selectEligible([
      report("a", "good", "2026-01-01", 4),
      report("a", "bare", "2026-01-08", 4, ""),
    ]);
    expect(result.totalDimensionEntries).toBe(24);
    expect(result.emptyRationaleEntries).toBe(12);
  });

  it("the DEPLOYED corpus's exclusions are measured, not taken from the design", () => {
    // Design D3 says nine reports were reconstructed. Measured against the
    // bundle this run reads it is more than that, and the empty-rationale
    // entries are entirely explained by them, no report has only SOME
    // rationales missing. A hardcoded nine would have quietly admitted the
    // rest into the calibration set.
    const bundle = coachDataJson as unknown as {
      coaches: Array<{
        id: string;
        reports: Array<{
          id: string;
          date: string;
          dimensions?: Array<{
            n: number;
            score: number | null;
            note?: string;
          }>;
        }>;
      }>;
    };
    const corpus: HandScoredReport[] = bundle.coaches.flatMap((c) =>
      c.reports.map((r) => ({
        coachId: c.id,
        reportId: r.id,
        date: r.date,
        dimensions: (r.dimensions ?? []).map((d) => ({
          n: d.n,
          score: d.score,
          rationale: d.note ?? "",
        })),
      })),
    );

    const result = selectEligible(corpus);
    const totalReports = corpus.length;
    expect(result.eligible.length + result.excluded.length).toBe(totalReports);
    // Every excluded report contributes exactly its full dimension set to the
    // empty count, which is the evidence that the share is whole reports and
    // not scattered gaps.
    const excludedEntries = result.excluded.length * DIMENSIONS.length;
    expect(result.emptyRationaleEntries).toBe(excludedEntries);
    expect(result.excluded.length).toBeGreaterThan(0);
  });
});

describe("an incomplete hand report is not a partial comparison", () => {
  it("excludes a report missing dimensions rather than comparing eight against twelve", () => {
    // composeBaseScore drops a null from the DENOMINATOR, which is right for a
    // judged not-applicable and wrong for a gap in the corpus: the hand
    // composite would be computed over the dimensions that happen to be there
    // and the machine's over all twelve, and the difference between those two
    // numbers is not agreement.
    const partial = report("c1", "r-partial", "2026-01-01", 4);
    partial.dimensions = partial.dimensions.slice(0, 8);

    const { eligible, excluded } = selectEligible([
      partial,
      report("c1", "r-whole", "2026-01-02", 4),
    ]);
    expect(eligible.map((r) => r.reportId)).toEqual(["r-whole"]);
    expect(excluded).toEqual([
      { reportId: "r-partial", coachId: "c1", reason: "incomplete-dimensions" },
    ]);
  });

  it("a not-applicable dimension is a JUDGEMENT and stays eligible", () => {
    // The distinction the exclusion rests on: null means the leader's session
    // gave nothing to score, which is a real observation, not a missing row.
    const withNulls = report("c1", "r-nulls", "2026-01-01", 4);
    withNulls.dimensions[3] = { n: 4, score: null, rationale: "nothing on it" };

    const { eligible, excluded } = selectEligible([withNulls]);
    expect(eligible.map((r) => r.reportId)).toEqual(["r-nulls"]);
    expect(excluded).toEqual([]);
  });

  it("the BUNDLED corpus carries all twelve on every report", () => {
    // Measured, not assumed: if a future bundle drops dimensions, the
    // calibration's eligible count moves and this says so.
    const corpus = (
      coachDataJson as {
        coaches: Array<{
          id: string;
          reports: Array<{
            id: string;
            date: string;
            dimensions: Array<{
              n: number;
              score: number | null;
              note?: string;
            }>;
          }>;
        }>;
      }
    ).coaches.flatMap((c) =>
      c.reports.map((r) => ({
        coachId: c.id,
        reportId: r.id,
        date: r.date,
        dimensions: r.dimensions.map((d) => ({
          n: d.n,
          score: d.score,
          rationale: d.note ?? "",
        })),
      })),
    );
    const { excluded } = selectEligible(corpus);
    expect(
      excluded.filter((e) => e.reason === "incomplete-dimensions"),
    ).toEqual([]);
  });
});

describe("the replay is stateful, in date order, per leader", () => {
  it("orders a leader's sessions oldest first", () => {
    // 'Authenticity Scored Against A Rolling Baseline' is stateful across a
    // leader's history, so scoring sessions independently measures a different
    // thing from what production does.
    const ordered = replayOrder([
      report("a", "third", "2026-03-01", 4),
      report("a", "first", "2026-01-01", 4),
      report("a", "second", "2026-02-01", 4),
    ]);
    expect(ordered.get("a")?.map((r) => r.reportId)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("keeps leaders apart, the baseline is per leader, not per programme", () => {
    const ordered = replayOrder([
      report("a", "a1", "2026-01-01", 4),
      report("b", "b1", "2026-01-02", 4),
    ]);
    expect([...ordered.keys()].sort()).toEqual(["a", "b"]);
    expect(ordered.get("a")?.length).toBe(1);
  });
});

describe("agreement is reported per leader as well as overall", () => {
  it("a perfect match is zero error and full within-one agreement", () => {
    const corpus = [report("a", "r1", "2026-01-01", 4)];
    const result = measureAgreement(
      corpus,
      new Map([["r1", machine("r1", 4)]]),
    );
    expect(result.overall.compositeMae).toBeCloseTo(0, 6);
    expect(result.overall.dimensionsWithinOne).toBeCloseTo(1, 6);
    expect(result.perLeader.get("a")?.reports).toBe(1);
  });

  it("one leader cannot carry the average alone", () => {
    // The benchmark leader is ~5x the median leader's share and is the only
    // one scored against his own rolling baseline, so his agreement is not
    // comparable to the others', it has to be visible separately.
    const corpus = [
      report("bench", "b1", "2026-01-01", 5),
      report("bench", "b2", "2026-01-08", 5),
      report("other", "o1", "2026-01-01", 5),
    ];
    const result = measureAgreement(
      corpus,
      new Map([
        ["b1", machine("b1", 5)],
        ["b2", machine("b2", 5)],
        ["o1", machine("o1", 1)],
      ]),
    );
    expect(result.perLeader.get("bench")?.compositeMae).toBeCloseTo(0, 6);
    expect(result.perLeader.get("other")?.compositeMae).toBeGreaterThan(50);
    // …and the overall figure does not hide it.
    expect(result.overall.compositeMae).toBeGreaterThan(0);
  });

  it("a dimension only ONE side judged is not a disagreement of size zero", () => {
    const corpus = [report("a", "r1", "2026-01-01", 4)];
    const partial: MachineScoring = {
      reportId: "r1",
      dimensions: new Map(DIMENSIONS.slice(0, 6).map((d) => [d.n, 4])),
    };
    const result = measureAgreement(corpus, new Map([["r1", partial]]));
    expect(result.overall.comparisons).toBe(6);
  });

  it("excluded reports never reach the measurement", () => {
    const corpus = [
      report("a", "good", "2026-01-01", 4),
      report("a", "bare", "2026-01-08", 4, ""),
    ];
    const result = measureAgreement(
      corpus,
      new Map([
        ["good", machine("good", 4)],
        ["bare", machine("bare", 1)],
      ]),
    );
    expect(result.overall.reports).toBe(1);
    expect(result.overall.compositeMae).toBeCloseTo(0, 6);
  });
});

describe("the tolerance is a delivery gate, not a report", () => {
  it("passes inside the stated tolerance", () => {
    const verdict = checkTolerance({
      compositeMae: 3,
      dimensionsWithinOne: 0.95,
      comparisons: 100,
      reports: 10,
    });
    expect(verdict.withinTolerance).toBe(true);
    expect(verdict.shortfalls).toEqual([]);
  });

  it("the gate is 5 points of MAE and 90% of dimensions within one", () => {
    // PINNED. The drift tests below used to be written relative to these
    // constants (`TOLERANCE_COMPOSITE_MAE + 1`), so widening the gate to 50
    // points would have kept every one of them green. What the numbers are is
    // a product decision, so the test states them.
    expect(TOLERANCE_COMPOSITE_MAE).toBe(5);
    expect(TOLERANCE_DIMENSIONS_WITHIN_ONE).toBe(0.9);
  });

  it("blocks and NAMES the shortfall when the composite drifts", () => {
    const verdict = checkTolerance({
      compositeMae: 6,
      dimensionsWithinOne: 0.99,
      comparisons: 100,
      reports: 10,
    });
    expect(verdict.withinTolerance).toBe(false);
    expect(verdict.shortfalls.join(" ")).toContain("composite MAE");
  });

  it("blocks when per-dimension agreement drifts, even with a fine composite", () => {
    // Offsetting errors can leave the composite looking healthy while every
    // individual judgement is wrong.
    const verdict = checkTolerance({
      compositeMae: 0,
      dimensionsWithinOne: 0.8,
      comparisons: 100,
      reports: 10,
    });
    expect(verdict.withinTolerance).toBe(false);
    expect(verdict.shortfalls.join(" ")).toContain("within 1");
  });

  it("the boundary itself passes: exactly 5 and exactly 90%", () => {
    // Both comparisons are strict, so the stated tolerance is inclusive. A
    // backtest landing exactly on it is not a failure.
    const verdict = checkTolerance({
      compositeMae: 5,
      dimensionsWithinOne: 0.9,
      comparisons: 100,
      reports: 10,
    });
    expect(verdict.withinTolerance).toBe(true);
  });

  it("an EMPTY measurement never passes, no evidence is not agreement", () => {
    // Passing here would ship unvalidated machine scores to leaders on the
    // strength of having measured nothing.
    const verdict = checkTolerance({
      compositeMae: 0,
      dimensionsWithinOne: 0,
      comparisons: 0,
      reports: 0,
    });
    expect(verdict.withinTolerance).toBe(false);
    expect(verdict.shortfalls.join(" ")).toContain("unmeasured");
  });
});

function agreement(reports: number, compositeMae: number): Agreement {
  return {
    compositeMae,
    dimensionsWithinOne: compositeMae <= 1 ? 0.95 : 0.6,
    comparisons: reports * 11,
    reports,
  };
}

function passingRun(leaders = MIN_CALIBRATION_LEADERS) {
  const perReport = Math.ceil(MIN_CALIBRATION_REPORTS / leaders);
  const perLeader = new Map(
    Array.from({ length: leaders }, (_, i) => [
      `leader-${i}`,
      agreement(perReport, 1),
    ]),
  );
  return {
    overall: agreement(perReport * leaders, 1),
    perLeader,
  };
}

describe("the calibration gate applies its per-leader rule and a minimum sample", () => {
  it("the sample floors are pinned", () => {
    expect(MIN_CALIBRATION_REPORTS).toBe(60);
    expect(MIN_CALIBRATION_LEADERS).toBe(10);
    expect(MIN_GATED_LEADER_REPORTS).toBe(3);
  });

  it("a run that meets every rule passes", () => {
    expect(checkCalibration(passingRun())).toEqual({
      withinTolerance: true,
      shortfalls: [],
      ungated: [],
    });
  });

  it("one benchmark leader cannot carry fifteen the model disagrees with", () => {
    const perLeader = new Map<string, Agreement>([
      ["benchmark", agreement(120, 1)],
    ]);
    for (let i = 0; i < 15; i += 1)
      perLeader.set(`leader-${i}`, agreement(3, 12));
    const overall = {
      compositeMae: (120 * 1 + 45 * 12) / 165,
      dimensionsWithinOne: 0.92,
      comparisons: 165 * 11,
      reports: 165,
    };
    expect(overall.compositeMae).toBe(4);
    expect(checkTolerance(overall).withinTolerance).toBe(true);

    const verdict = checkCalibration({ overall, perLeader });
    expect(verdict.withinTolerance).toBe(false);
    for (let i = 0; i < 15; i += 1)
      expect(verdict.shortfalls.join("\n")).toContain(
        `leader-${i}: composite MAE 12.00`,
      );
    expect(verdict.shortfalls.join("\n")).not.toContain("benchmark:");
  });

  it("a leader with fewer than three compared reports is measured and named, but does not block", () => {
    const run = passingRun();
    run.perLeader.set("thin-leader", agreement(2, 12));
    const verdict = checkCalibration(run);
    expect(verdict.withinTolerance).toBe(true);
    expect(verdict.ungated).toEqual(["thin-leader"]);
  });

  it("a leader with exactly three compared reports is gated", () => {
    const run = passingRun();
    run.perLeader.set("three-report-leader", agreement(3, 12));
    const verdict = checkCalibration(run);
    expect(verdict.withinTolerance).toBe(false);
    expect(verdict.shortfalls.join(" ")).toContain(
      "three-report-leader: composite MAE 12.00",
    );
  });

  it("too few reports is a shortfall however well they agree", () => {
    const run = passingRun();
    run.overall = { ...run.overall, reports: MIN_CALIBRATION_REPORTS - 1 };
    const verdict = checkCalibration(run);
    expect(verdict.withinTolerance).toBe(false);
    expect(verdict.shortfalls.join(" ")).toContain(
      `${MIN_CALIBRATION_REPORTS - 1} reports compared, below ${MIN_CALIBRATION_REPORTS}`,
    );
  });

  it("too few leaders is a shortfall however well they agree", () => {
    const run = passingRun();
    run.perLeader.delete("leader-0");
    const verdict = checkCalibration(run);
    expect(verdict.withinTolerance).toBe(false);
    expect(verdict.shortfalls.join(" ")).toContain(
      `${MIN_CALIBRATION_LEADERS - 1} leaders compared, below ${MIN_CALIBRATION_LEADERS}`,
    );
  });
});

describe("the delivery gate reads the per-leader agreement it was recorded with", () => {
  const VERSION = "calib-per-leader-test";
  const REPORT = "calib-per-leader-report";
  const conn = Database.getOrCreateConnection();

  afterEach(async () => {
    await conn
      .deleteFrom("coach_calibration_runs")
      .where("model_version", "=", VERSION)
      .execute();
    await conn.deleteFrom("coach_reports").where("id", "=", REPORT).execute();
  });

  async function reportScoredBy(version: string) {
    await conn
      .insertInto("coach_reports")
      .values({
        id: REPORT,
        coach_id: "calib-per-leader-coach",
        session_date: "2026-09-01",
        source_session_id: `ff-${REPORT}`,
        legacy_ids: [],
        summary: {},
        metrics: {},
        body: {},
      })
      .execute();
    await conn
      .insertInto("coach_report_dimension_scores")
      .values({
        report_id: REPORT,
        dimension_n: 1,
        score: 4,
        rationale: "r",
        provenance: "machine",
        model_version: version,
      })
      .execute();
  }

  it("a stored run whose leaders disagree holds delivery", async () => {
    const run = passingRun();
    run.perLeader.set("leader-0", agreement(6, 12));
    await recordCalibration(Database, VERSION, run);
    await reportScoredBy(VERSION);

    expect((await calibrationShortfalls(Database, REPORT)).join(" ")).toContain(
      "leader-0: composite MAE 12.00",
    );
  });

  it("a stored passing run releases delivery", async () => {
    await recordCalibration(Database, VERSION, passingRun());
    await reportScoredBy(VERSION);
    expect(await calibrationShortfalls(Database, REPORT)).toEqual([]);
  });

  it("a run recorded without per-leader agreement fails closed", async () => {
    await conn
      .insertInto("coach_calibration_runs")
      .values({
        model_version: VERSION,
        composite_mae: 1,
        dimensions_within_one: 0.95,
        comparisons: 1000,
        reports: 100,
      })
      .execute();
    await reportScoredBy(VERSION);
    expect((await calibrationShortfalls(Database, REPORT)).join(" ")).toContain(
      "no per-leader agreement",
    );
  });
});
