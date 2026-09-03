import { describe, expect, it } from "bun:test";

import { DIMENSIONS } from "./rubric";
import {
  type RawDimensionScore,
  missingDimensions,
  validateDimensionScores,
} from "./scoring-validation";

function good(n: number, score: number | null = 4): RawDimensionScore {
  return { n, score, rationale: `a real reason for dimension ${n}` };
}

const ALL_GOOD = DIMENSIONS.map((d) => good(d.n));

describe("what the scoring model returns is gated before it is stored", () => {
  it("accepts a complete, well-formed set", () => {
    const result = validateDimensionScores(ALL_GOOD);
    expect(result.ok).toBe(true);
    expect(result.scores?.size).toBe(12);
    expect(missingDimensions(result.scores as Map<number, unknown>)).toEqual(
      [],
    );
  });

  it("rejects a score outside 1-5", () => {
    const result = validateDimensionScores([good(1, 9)]);
    expect(result.ok).toBe(false);
    expect(result.issues[0].problem).toBe("score-out-of-range");
  });

  it("rejects a fractional score, the rubric is whole points", () => {
    const result = validateDimensionScores([good(1, 3.5)]);
    expect(result.ok).toBe(false);
    expect(result.issues[0].problem).toBe("score-not-integer");
  });

  it("rejects a dimension with NO rationale, however plausible the number", () => {
    // A number nobody can review is not a judgement. It cannot be corrected by
    // the admin path or disputed by the leader it is about.
    const result = validateDimensionScores([
      { n: 1, score: 5, rationale: "   " },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues[0].problem).toBe("missing-rationale");
  });

  it("rejects a placeholder rationale", () => {
    const result = validateDimensionScores([
      { n: 1, score: 5, rationale: "ok" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues[0].problem).toBe("missing-rationale");
  });

  it("records an unobservable dimension as NOT APPLICABLE, not as a low score", () => {
    // Scoring low would be a silent false judgement about the leader.
    // Not-applicable leaves the cluster denominator smaller and costs nothing.
    const result = validateDimensionScores([
      {
        n: 2,
        score: null,
        rationale: "no newcomers were present this session",
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.scores?.get(2)).toBeNull();
  });

  it("a not-applicable dimension still needs its reason", () => {
    const result = validateDimensionScores([
      { n: 2, score: null, rationale: "" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues[0].problem).toBe("missing-rationale");
  });

  it("rejects a dimension both scored and marked not applicable", () => {
    const result = validateDimensionScores([
      { n: 2, score: 4, rationale: "contradicts itself", notApplicable: true },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues[0].problem).toBe("scored-but-marked-not-applicable");
  });

  it("rejects a dimension the rubric does not have", () => {
    const result = validateDimensionScores([good(13)]);
    expect(result.ok).toBe(false);
    expect(result.issues[0].problem).toBe("unknown-dimension");
  });

  it("rejects the same dimension scored twice", () => {
    const result = validateDimensionScores([good(1, 4), good(1, 2)]);
    expect(result.ok).toBe(false);
    expect(result.issues[0].problem).toBe("duplicate-dimension");
  });

  it("reports EVERY problem, not just the first", () => {
    const result = validateDimensionScores([good(1, 9), good(2, 0), good(13)]);
    expect(result.issues.length).toBe(3);
  });

  it("SILENCE is not not-applicable, an omitted dimension is missing", () => {
    // A model that omits a dimension has said nothing about it. Treating that
    // as 'not observable' would shrink the cluster denominator and inflate the
    // composite, a leader would be rewarded for the model's omission.
    const partial = validateDimensionScores([good(1), good(2), good(3)]);
    expect(partial.ok).toBe(true);
    expect(missingDimensions(partial.scores as Map<number, unknown>)).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });
});
