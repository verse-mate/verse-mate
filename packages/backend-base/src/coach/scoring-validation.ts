import { DIMENSIONS } from "./rubric";

/**
 * Gates on what the scoring model returns (change: port-coach-pipeline,
 * task 5.2), in the shape of `generation-validation.ts`: pure, so every gate is
 * unit-testable without a model, a database or a network.
 *
 * The rule these enforce is that a score is a JUDGEMENT WITH A REASON. A number
 * with no rationale cannot be reviewed by the admin path (task 5.7) or disputed
 * by the leader it is about, so it is rejected rather than stored — and a
 * dimension the session gives no evidence for is recorded as NOT APPLICABLE,
 * never guessed and never scored low. Scoring low would be a silent, false
 * judgement about the leader; not-applicable is excluded from the cluster
 * denominator and costs them nothing.
 */

export interface RawDimensionScore {
  n: number;
  /** null = not observable this session. */
  score: number | null;
  rationale: string;
  notApplicable?: boolean;
}

export interface ScoringIssue {
  n: number;
  problem:
    | "unknown-dimension"
    | "duplicate-dimension"
    | "score-out-of-range"
    | "score-not-integer"
    | "missing-rationale"
    | "scored-but-marked-not-applicable";
  detail: string;
}

export interface ValidatedScoring {
  ok: boolean;
  issues: ScoringIssue[];
  /** Present only when ok. Keyed by dimension number; null = not applicable. */
  scores?: Map<number, number | null>;
  rationales?: Map<number, string>;
}

const VALID_DIMENSIONS = new Set(DIMENSIONS.map((d) => d.n));

/** A rationale must be a real sentence, not a placeholder. */
const MIN_RATIONALE_LENGTH = 10;

export function validateDimensionScores(
  raw: RawDimensionScore[],
): ValidatedScoring {
  const issues: ScoringIssue[] = [];
  const scores = new Map<number, number | null>();
  const rationales = new Map<number, string>();

  for (const entry of raw) {
    if (!VALID_DIMENSIONS.has(entry.n)) {
      issues.push({
        n: entry.n,
        problem: "unknown-dimension",
        detail: `dimension ${entry.n} is not in the rubric`,
      });
      continue;
    }
    if (scores.has(entry.n)) {
      issues.push({
        n: entry.n,
        problem: "duplicate-dimension",
        detail: `dimension ${entry.n} scored more than once`,
      });
      continue;
    }

    const rationale = (entry.rationale ?? "").trim();
    if (rationale.length < MIN_RATIONALE_LENGTH) {
      // Rejected even when the score itself looks fine: an unexplained number
      // cannot be reviewed or disputed, which is the whole point of scoring a
      // person's teaching.
      issues.push({
        n: entry.n,
        problem: "missing-rationale",
        detail: `dimension ${entry.n} has no usable rationale`,
      });
      continue;
    }

    const notApplicable = entry.notApplicable === true || entry.score === null;
    if (notApplicable) {
      if (entry.score !== null && entry.notApplicable === true) {
        issues.push({
          n: entry.n,
          problem: "scored-but-marked-not-applicable",
          detail: `dimension ${entry.n} is both scored and marked not applicable`,
        });
        continue;
      }
      scores.set(entry.n, null);
      rationales.set(entry.n, rationale);
      continue;
    }

    const score = entry.score as number;
    if (!Number.isInteger(score)) {
      issues.push({
        n: entry.n,
        problem: "score-not-integer",
        detail: `dimension ${entry.n} scored ${score}; the rubric is 1-5 whole points`,
      });
      continue;
    }
    if (score < 1 || score > 5) {
      issues.push({
        n: entry.n,
        problem: "score-out-of-range",
        detail: `dimension ${entry.n} scored ${score}; the rubric is 1-5`,
      });
      continue;
    }

    scores.set(entry.n, score);
    rationales.set(entry.n, rationale);
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, issues, scores, rationales };
}

/**
 * Dimensions the model did not return at all.
 *
 * Silence is NOT not-applicable. A model that omits a dimension has told us
 * nothing about it, and treating that as "not observable" would quietly shrink
 * the cluster denominator and inflate the score.
 */
export function missingDimensions(
  scores: ReadonlyMap<number, unknown>,
): number[] {
  return DIMENSIONS.filter((d) => !scores.has(d.n)).map((d) => d.n);
}
