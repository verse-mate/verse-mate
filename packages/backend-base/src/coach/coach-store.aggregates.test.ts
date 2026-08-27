/**
 * Trends, the admin roster and monthly previously read the compiled-in bundle
 * while reports came from the store — so a freshly published session appeared
 * in the session list but NOT in the trend chart or the roster count, until the
 * next deploy. These assert all three now reflect the store.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import coachDataJson from "./coach.data.json";
import { CoachService } from "./coach.service";
import { CoachReportsRepository } from "./repository/coach-reports.repository";

const conn = Database.getOrCreateConnection();
const repo = new CoachReportsRepository(Database);
const service = new CoachService(Database);

// A coach that exists in the bundle, so the roster resolves them.
const bundled = (coachDataJson as { coaches: any[] }).coaches[0];
const COACH: string = bundled.id;

function storeRow(id: string, date: string, score: number) {
  return {
    id,
    coach_id: COACH,
    session_date: date,
    legacy_ids: [] as string[],
    summary: {
      dateLabel: date,
      session: `Store session ${date}`,
      topic: "Joel",
      score,
      status: "On Target",
      statusEmoji: "🟡",
      newcomers: 2,
    },
    metrics: {
      clusters: [{ name: "Teaching Craft", weight: 33, contribution: 20 }],
      dimensions: [{ n: 1, name: "Session Structure & Flow", score: 4 }],
    },
    body: {},
  };
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

describe("trends / roster / monthly read the store", () => {
  beforeAll(async () => {
    await clear();
    await repo.upsert(storeRow("agg-1", "2026-09-05", 60));
    await repo.upsert(storeRow("agg-2", "2026-09-12", 80));
    await repo.bumpMeta("2026-09-12");
  });
  afterAll(clear);

  it("trends plot the store's sessions, not the bundle's", async () => {
    const trends = await service.getTrendsById(COACH);
    expect(trends?.scoreSeries.length).toBe(2);
    expect(trends?.scoreSeries.map((p) => p.score)).toEqual([60, 80]);
    // delta is computed from the two most recent STORE sessions
    expect(trends?.delta?.to).toBe(80);
    expect(trends?.delta?.from).toBe(60);
  });

  it("the admin roster counts the store's sessions and shows its latest", async () => {
    const roster = await service.listCoaches();
    const entry = roster.find((c) => c.id === COACH);
    expect(entry?.sessionCount).toBe(2);
    expect(entry?.latest?.date).toBe("2026-09-12");
    expect(entry?.latest?.score).toBe(80);
  });

  it("the monthly rollup includes a session published to the store", async () => {
    const monthly = await service.getMonthly("2026-09");
    const leader = monthly.leaders.find((l) => l.id === COACH);
    expect(leader?.sessions).toBe(2);
    expect(leader?.avgScore).toBe(70); // (60 + 80) / 2
    expect(monthly.availableMonths).toContain("2026-09");
  });
});
