import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import {
  FIXTURE_LEADERS,
  FIXTURE_REPORTS,
  clearCoachFixture,
  seedCoachFixture,
} from "./coach-fixture";
import { isolateTable } from "./coach-test-tables";
import { CoachService } from "./coach.service";
import { CoachReportsRepository } from "./repository/coach-reports.repository";

const conn = Database.getOrCreateConnection();
isolateTable("coach_dataset_meta");
const repo = new CoachReportsRepository(Database);
const service = new CoachService(Database);

const COACH: string = FIXTURE_LEADERS[0].slug;
const LEGACY = FIXTURE_REPORTS.filter((r) => r.coachId === COACH).length;

function storeRow(id: string, date: string, score: number) {
  return {
    id,
    coach_id: COACH,
    session_date: date,
    source_session_id: `ff-${id}`,
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
  await clearCoachFixture(Database);
  await conn.deleteFrom("coach_dataset_meta").execute();
}

describe("trends / roster / monthly read the store", () => {
  beforeAll(async () => {
    await clear();
    await seedCoachFixture(Database);
    await repo.upsert(storeRow("agg-1", "2099-01-03", 60));
    await repo.upsert(storeRow("agg-2", "2099-01-10", 80));
    await repo.bumpMeta("2099-01-10");
  });
  afterAll(clear);

  it("trends plot the sessions published to the store", async () => {
    const trends = await service.getTrendsById(COACH);
    expect(trends?.scoreSeries.length).toBe(LEGACY + 2);
    expect(trends?.scoreSeries.slice(-2).map((p) => p.score)).toEqual([60, 80]);
    expect(trends?.scoreSeries.slice(-2).map((p) => p.reportId)).toEqual([
      "agg-1",
      "agg-2",
    ]);
    expect(trends?.delta?.to).toBe(80);
    expect(trends?.delta?.from).toBe(60);
  });

  it("the admin roster counts the store's sessions and shows its latest", async () => {
    const roster = await service.listCoaches();
    const entry = roster.find((c) => c.id === COACH);
    expect(entry?.sessionCount).toBe(LEGACY + 2);
    expect(entry?.latest?.date).toBe("2099-01-10");
    expect(entry?.latest?.score).toBe(80);
  });

  it("the monthly rollup includes a session published to the store", async () => {
    const monthly = await service.getMonthly("2099-01");
    const leader = monthly.leaders.find((l) => l.id === COACH);
    expect(leader?.sessions).toBe(2);
    expect(leader?.avgScore).toBe(70);
    expect(monthly.availableMonths).toContain("2099-01");
  });
});
