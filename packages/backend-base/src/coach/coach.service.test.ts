import { describe, expect, it } from "bun:test";
import { type CoachReport, CoachService } from "./coach.service";

// listCoaches / getReportsById / getTrendsById are pure over the bundled
// dataset — the constructor only stores `db`, so a dummy is safe here.
// biome-ignore lint/suspicious/noExplicitAny: test-only dummy db
const svc = new CoachService(undefined as any);

// buildTrends is a pure static — exercise it without a DB connection.

function report(over: Partial<CoachReport>): CoachReport {
  return {
    id: "r",
    date: "2026-01-01",
    dateLabel: "January 1, 2026",
    session: "Session",
    topic: "Topic",
    duration: "1h",
    attendees: 10,
    newcomers: 0,
    score: 70,
    base: 70,
    newcomerBonus: 0,
    sizeBonus: 0,
    status: "On Target",
    statusEmoji: "🟡",
    clusters: [
      { name: "Teaching Craft", weight: 33, scorePct: 70, contribution: 23.1 },
    ],
    dimensions: [
      { n: 1, name: "Session Structure & Flow", score: 4 },
      { n: 2, name: "Newcomer Welcome", score: null },
    ],
    bigIdeas: [],
    feedback: {
      headline: "",
      strengths: [],
      improvements: [],
      recommendations: [],
    },
    docUrl: "",
    pdfUrl: "",
    ...over,
  };
}

describe("CoachService.buildTrends", () => {
  it("sorts reports oldest-first for the score series", () => {
    const trends = CoachService.buildTrends([
      report({ id: "b", date: "2026-03-01", score: 80 }),
      report({ id: "a", date: "2026-01-01", score: 60 }),
    ]);
    expect(trends.scoreSeries.map((p) => p.date)).toEqual([
      "2026-01-01",
      "2026-03-01",
    ]);
    expect(trends.scoreSeries.map((p) => p.score)).toEqual([60, 80]);
  });

  it("computes the latest-vs-previous delta", () => {
    const trends = CoachService.buildTrends([
      report({ date: "2026-01-01", dateLabel: "Jan 1", score: 60 }),
      report({ date: "2026-02-01", dateLabel: "Feb 1", score: 68.5 }),
    ]);
    expect(trends.delta).toEqual({
      score: 8.5,
      from: 60,
      to: 68.5,
      fromLabel: "Jan 1",
      toLabel: "Feb 1",
    });
  });

  it("has no delta for a single session", () => {
    const trends = CoachService.buildTrends([report({})]);
    expect(trends.delta).toBeNull();
  });

  it("preserves N/A dimensions as null (gapped line, not zero)", () => {
    const trends = CoachService.buildTrends([report({})]);
    expect(trends.dimensionSeries[0]["Newcomer Welcome"]).toBeNull();
    expect(trends.dimensionSeries[0]["Session Structure & Flow"]).toBe(4);
  });

  it("keys cluster series rows by cluster name", () => {
    const trends = CoachService.buildTrends([report({})]);
    expect(trends.clusterSeries[0]["Teaching Craft"]).toBe(23.1);
  });
});

describe("CoachService admin oversight", () => {
  it("lists every coach with a newest-first latest summary", () => {
    const coaches = svc.listCoaches();
    expect(coaches.length).toBeGreaterThan(0);
    const jeff = coaches.find((c) => c.id === "jeff-ward");
    expect(jeff).toBeDefined();
    expect(jeff?.sessionCount).toBeGreaterThanOrEqual(1);
    // latest.date must be >= every other report date for that coach.
    const reports = svc.getReportsById("jeff-ward") ?? [];
    const maxDate = reports.reduce((m, r) => (r.date > m ? r.date : m), "");
    expect(jeff?.latest?.date).toBe(maxDate);
  });

  it("returns reports for a known coach id and null for an unknown one", () => {
    expect(svc.getReportsById("jeff-ward")).not.toBeNull();
    expect(svc.getReportsById("nope")).toBeNull();
    expect(svc.getTrendsById("nope")).toBeNull();
    expect(svc.getProfileById("nope")).toBeNull();
  });
});
