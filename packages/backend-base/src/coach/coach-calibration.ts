import { DIMENSIONS, composeBaseScore } from "./rubric";

/**
 * The calibration backtest (change: port-coach-pipeline, task 5.8, design D3).
 *
 * The hand-scored corpus is the only evidence that a machine score means the
 * same thing as the scores sixteen leaders have already received. This module
 * is the harness: eligibility, replay order, and the agreement arithmetic. It
 * is pure, so the whole thing is testable without spending a model call.
 *
 * Running it for real against the backfilled corpus is a separate, deliberate
 * act, see `runCalibration` in the script that drives it.
 */

export interface HandScoredReport {
  coachId: string;
  reportId: string;
  /** yyyy-mm-dd. Replay order. */
  date: string;
  dimensions: Array<{ n: number; score: number | null; rationale: string }>;
}

export type IneligibleReason =
  | "no-rationale-anywhere"
  /**
   * The hand report does not carry all twelve dimensions.
   *
   * An omitted dimension is not a not-applicable one, and the difference is
   * load-bearing: `composeBaseScore` excludes a null from the denominator, so
   * a hand report missing four dimensions had its composite computed over the
   * remaining eight while the machine's was computed over twelve. Comparing
   * those two numbers measures nothing, and it flattered the agreement,
   * because a partial composite sits closer to the middle of the range.
   */
  | "incomplete-dimensions";

export interface EligibilityResult {
  eligible: HandScoredReport[];
  excluded: Array<{
    reportId: string;
    coachId: string;
    reason: IneligibleReason;
  }>;
  /** Dimension entries with an empty rationale, across the WHOLE corpus. */
  emptyRationaleEntries: number;
  totalDimensionEntries: number;
}

/**
 * Which hand-scored reports the backtest may be measured against.
 *
 * A report with no rationale on ANY dimension is excluded. That is what
 * "mechanically reconstructed from .docx with no re-analysis" looks like in
 * the data, and it is also exactly the unknown-provenance case D3 says must be
 * excluded rather than silently averaged in: the numbers exist, but nothing
 * records who or what produced them, so agreeing with them proves nothing.
 *
 * The count is DERIVED, never asserted. Design D3 says "nine reports"; measured
 * against the 2026-09-01 bundle it is nineteen, and the empty-rationale entries
 * (228) are entirely explained by them, no report has only SOME rationales
 * missing. A hardcoded nine would have quietly admitted ten unusable reports.
 */
export function selectEligible(corpus: HandScoredReport[]): EligibilityResult {
  const eligible: HandScoredReport[] = [];
  const excluded: EligibilityResult["excluded"] = [];
  let emptyRationaleEntries = 0;
  let totalDimensionEntries = 0;

  for (const report of corpus) {
    const withRationale = report.dimensions.filter(
      (d) => (d.rationale ?? "").trim().length > 0,
    );
    totalDimensionEntries += report.dimensions.length;
    emptyRationaleEntries += report.dimensions.length - withRationale.length;

    if (withRationale.length === 0) {
      excluded.push({
        reportId: report.reportId,
        coachId: report.coachId,
        reason: "no-rationale-anywhere",
      });
      continue;
    }

    // Every dimension present, whatever its value. A null is a judgement
    // ("nothing in this session speaks to it"); an absent entry is a gap in
    // the corpus, and the two cannot be compared the same way.
    const present = new Set(report.dimensions.map((d) => d.n));
    if (DIMENSIONS.some((d) => !present.has(d.n))) {
      excluded.push({
        reportId: report.reportId,
        coachId: report.coachId,
        reason: "incomplete-dimensions",
      });
      continue;
    }
    eligible.push(report);
  }

  return { eligible, excluded, emptyRationaleEntries, totalDimensionEntries };
}

/**
 * Replay order: by date, oldest first, within a leader.
 *
 * "Authenticity Scored Against A Rolling Baseline" is STATEFUL across a
 * leader's history, so scoring sessions independently measures a different
 * thing from what production does. Grouped by leader because the baseline is
 * per leader, not per programme.
 */
export function replayOrder(
  corpus: HandScoredReport[],
): Map<string, HandScoredReport[]> {
  const byCoach = new Map<string, HandScoredReport[]>();
  for (const r of corpus) {
    const list = byCoach.get(r.coachId) ?? [];
    list.push(r);
    byCoach.set(r.coachId, list);
  }
  for (const list of byCoach.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return byCoach;
}

export interface Agreement {
  /** Composite mean absolute error, 0-100 scale. */
  compositeMae: number;
  /** Share of dimension comparisons within one point, 0-1. */
  dimensionsWithinOne: number;
  /** Comparisons that contributed. */
  comparisons: number;
  reports: number;
}

export interface CalibrationReport {
  overall: Agreement;
  /**
   * Per leader as well as overall. The benchmark leader is ~5x the median
   * leader's share and is the only one scored against his own rolling
   * baseline, so his agreement is not comparable to the others' and must not
   * be able to carry the average on his own.
   */
  perLeader: Map<string, Agreement>;
  excluded: EligibilityResult["excluded"];
  emptyRationaleEntries: number;
  totalDimensionEntries: number;
}

/** One machine attempt at a report, to compare against the hand score. */
export interface MachineScoring {
  reportId: string;
  dimensions: Map<number, number | null>;
}

function agreementOf(
  pairs: Array<{ hand: HandScoredReport; machine: MachineScoring }>,
): Agreement {
  let absErrorSum = 0;
  let within = 0;
  let comparisons = 0;

  for (const { hand, machine } of pairs) {
    const handScores = new Map(hand.dimensions.map((d) => [d.n, d.score]));
    for (const d of DIMENSIONS) {
      const h = handScores.get(d.n);
      const m = machine.dimensions.get(d.n);
      // Only comparable when BOTH judged it. A dimension one side called
      // not-applicable is not a disagreement of size zero.
      if (h == null || m == null) continue;
      comparisons += 1;
      if (Math.abs(h - m) <= 1) within += 1;
    }
    absErrorSum += Math.abs(
      composeBaseScore(handScores).base -
        composeBaseScore(machine.dimensions).base,
    );
  }

  return {
    compositeMae: pairs.length === 0 ? 0 : absErrorSum / pairs.length,
    dimensionsWithinOne: comparisons === 0 ? 0 : within / comparisons,
    comparisons,
    reports: pairs.length,
  };
}

export function measureAgreement(
  corpus: HandScoredReport[],
  machineByReport: Map<string, MachineScoring>,
): CalibrationReport {
  const { eligible, excluded, emptyRationaleEntries, totalDimensionEntries } =
    selectEligible(corpus);

  const perLeader = new Map<string, Agreement>();
  const allPairs: Array<{ hand: HandScoredReport; machine: MachineScoring }> =
    [];

  for (const [coachId, reports] of replayOrder(eligible)) {
    const pairs = reports
      .map((hand) => ({ hand, machine: machineByReport.get(hand.reportId) }))
      .filter(
        (p): p is { hand: HandScoredReport; machine: MachineScoring } =>
          p.machine !== undefined,
      );
    perLeader.set(coachId, agreementOf(pairs));
    allPairs.push(...pairs);
  }

  return {
    overall: agreementOf(allPairs),
    perLeader,
    excluded,
    emptyRationaleEntries,
    totalDimensionEntries,
  };
}

/**
 * The delivery gate (task 5.9).
 *
 * Open question 3, answered provisionally 2026-09-01 (Andy confirms before
 * cutover): composite MAE at or under 5 points, AND at least 90% of dimension
 * comparisons within one point.
 */
export const TOLERANCE_COMPOSITE_MAE = 5;
export const TOLERANCE_DIMENSIONS_WITHIN_ONE = 0.9;

export interface ToleranceVerdict {
  withinTolerance: boolean;
  /** Named shortfalls, so a failure is reported rather than merely refused. */
  shortfalls: string[];
}

export function checkTolerance(agreement: Agreement): ToleranceVerdict {
  const shortfalls: string[] = [];
  if (agreement.reports === 0) {
    // Never "passes" on an empty measurement: no evidence is not agreement,
    // and treating it as such would ship unvalidated scores to leaders.
    shortfalls.push("no reports were compared, so agreement is unmeasured");
  }
  if (agreement.compositeMae > TOLERANCE_COMPOSITE_MAE) {
    shortfalls.push(
      `composite MAE ${agreement.compositeMae.toFixed(2)} exceeds ${TOLERANCE_COMPOSITE_MAE}`,
    );
  }
  if (agreement.dimensionsWithinOne < TOLERANCE_DIMENSIONS_WITHIN_ONE) {
    shortfalls.push(
      `${(agreement.dimensionsWithinOne * 100).toFixed(1)}% of dimensions within 1, below ${TOLERANCE_DIMENSIONS_WITHIN_ONE * 100}%`,
    );
  }
  return { withinTolerance: shortfalls.length === 0, shortfalls };
}
