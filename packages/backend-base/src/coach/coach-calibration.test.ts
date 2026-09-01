import { describe, expect, it } from "bun:test";

import {
  type HandScoredReport,
  type MachineScoring,
  TOLERANCE_COMPOSITE_MAE,
  TOLERANCE_DIMENSIONS_WITHIN_ONE,
  checkTolerance,
  measureAgreement,
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
    // entries are entirely explained by them — no report has only SOME
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
    // empty count — which is the evidence that the share is whole reports and
    // not scattered gaps.
    const excludedEntries = result.excluded.length * DIMENSIONS.length;
    expect(result.emptyRationaleEntries).toBe(excludedEntries);
    expect(result.excluded.length).toBeGreaterThan(0);
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

  it("keeps leaders apart — the baseline is per leader, not per programme", () => {
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
    // comparable to the others' — it has to be visible separately.
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

  it("blocks and NAMES the shortfall when the composite drifts", () => {
    const verdict = checkTolerance({
      compositeMae: TOLERANCE_COMPOSITE_MAE + 1,
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
      dimensionsWithinOne: TOLERANCE_DIMENSIONS_WITHIN_ONE - 0.1,
      comparisons: 100,
      reports: 10,
    });
    expect(verdict.withinTolerance).toBe(false);
    expect(verdict.shortfalls.join(" ")).toContain("within 1");
  });

  it("an EMPTY measurement never passes — no evidence is not agreement", () => {
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
