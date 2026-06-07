import { describe, expect, it } from "bun:test";
import { aggregateRemaining, splitKinds } from "./translation-job.service";

/**
 * Pure-logic unit tests for the translation-job delta computation. No DB:
 * `splitKinds` and `aggregateRemaining` are the side-effect-free core that
 * `computeRemainingUnits` builds on (the DB part only feeds per-book request
 * counts into `aggregateRemaining`).
 */

describe("splitKinds", () => {
  it("splits commentary types from the literal 'study'", () => {
    expect(splitKinds(["summary", "byline", "study"])).toEqual({
      commentaryTypes: ["summary", "byline"],
      includeStudy: true,
    });
  });

  it("keeps commentary types in canonical order regardless of input order", () => {
    expect(splitKinds(["detailed", "summary"]).commentaryTypes).toEqual([
      "summary",
      "detailed",
    ]);
  });

  it("study-only", () => {
    expect(splitKinds(["study"])).toEqual({
      commentaryTypes: [],
      includeStudy: true,
    });
  });

  it("ignores unknown kinds", () => {
    expect(splitKinds(["bogus", "summary"])).toEqual({
      commentaryTypes: ["summary"],
      includeStudy: false,
    });
  });

  it("empty kinds → nothing", () => {
    expect(splitKinds([])).toEqual({
      commentaryTypes: [],
      includeStudy: false,
    });
  });
});

describe("aggregateRemaining", () => {
  it("sums units and drops zero-work books", () => {
    const result = aggregateRemaining([
      { bookName: "James", commentaryUnits: 3, studyUnits: 5 },
      { bookName: "Jude", commentaryUnits: 0, studyUnits: 0 },
      { bookName: "Titus", commentaryUnits: 2, studyUnits: 0 },
    ]);
    expect(result.total).toBe(10);
    expect(result.perBook).toEqual([
      { bookName: "James", commentaryUnits: 3, studyUnits: 5 },
      { bookName: "Titus", commentaryUnits: 2, studyUnits: 0 },
    ]);
  });

  it("empty input → zero", () => {
    expect(aggregateRemaining([])).toEqual({ perBook: [], total: 0 });
  });

  it("all-done scope → total 0, no books", () => {
    const result = aggregateRemaining([
      { bookName: "James", commentaryUnits: 0, studyUnits: 0 },
    ]);
    expect(result.total).toBe(0);
    expect(result.perBook).toEqual([]);
  });
});
