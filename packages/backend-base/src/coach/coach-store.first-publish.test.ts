import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { backfillCoachStore } from "./coach-store.backfill";
import { isolateTable } from "./coach-test-tables";
import coachDataJson from "./coach.data.json";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
isolateTable("coach_dataset_meta");
const service = new CoachService(Database);

const bundle = coachDataJson as unknown as {
  coaches: Array<{ id: string; reports: Array<{ id: string; date: string }> }>;
};
const leader = bundle.coaches.reduce((a, b) =>
  b.reports.length > a.reports.length ? b : a,
);
const COACH_ID = leader.id;
const BUNDLED = leader.reports.length;
const ALL_BUNDLE_IDS = bundle.coaches.map((c) => c.id);

function published(sourceSessionId: string, date: string) {
  return {
    coachId: COACH_ID,
    date,
    sourceSessionId,
    summary: {
      dateLabel: date,
      session: `Pipeline ${sourceSessionId}`,
      topic: "Joel",
      duration: 60,
      attendees: 9,
      newcomers: 1,
      score: 70,
      status: "On Target",
      statusEmoji: "🟢",
      docUrl: "",
      pdfUrl: "",
    },
    metrics: {
      base: 60,
      newcomerBonus: 5,
      sizeBonus: 5,
      clusters: [],
      dimensions: [],
    },
    body: { bigIdeas: ["x"], feedback: { headline: "ok" } },
  };
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", ALL_BUNDLE_IDS)
    .execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

describe("a pipeline publish before the backfill never shrinks a leader's history", () => {
  beforeEach(clear);
  afterAll(clear);

  it("the leader keeps every bundled session and gains the published one", async () => {
    expect(BUNDLED).toBeGreaterThan(1);
    expect((await service.getReportsById(COACH_ID))?.length).toBe(BUNDLED);

    await service.ingestReports({
      reports: [published("ff-first-publish", "2099-01-02")],
    });

    const reports = await service.getReportsById(COACH_ID);
    expect(reports?.length).toBe(BUNDLED + 1);
    expect(reports?.[0].date).toBe("2099-01-02");

    const page = await service.getReportSummaries(COACH_ID, { limit: 100 });
    expect(page.total).toBe(BUNDLED + 1);
    expect(page.items.length).toBe(BUNDLED + 1);
    expect(page.items[0].date).toBe("2099-01-02");

    const trends = await service.getTrendsById(COACH_ID);
    expect(trends).not.toBeNull();

    const roster = await service.listCoaches();
    expect(roster.find((c) => c.id === COACH_ID)?.sessionCount).toBe(
      BUNDLED + 1,
    );
  });

  it("the summary list pages across bundled and published sessions without gaps", async () => {
    await service.ingestReports({
      reports: [published("ff-page", "2099-01-02")],
    });
    const first = await service.getReportSummaries(COACH_ID, {
      limit: 2,
      offset: 0,
    });
    const second = await service.getReportSummaries(COACH_ID, {
      limit: 2,
      offset: 2,
    });
    expect(first.total).toBe(BUNDLED + 1);
    expect(first.items[0].date).toBe("2099-01-02");
    const ids = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("once the leader is backfilled the store answers alone, without doubling", async () => {
    await service.ingestReports({
      reports: [published("ff-after-backfill", "2099-01-02")],
    });
    await backfillCoachStore();

    expect((await service.getReportsById(COACH_ID))?.length).toBe(BUNDLED + 1);
    const page = await service.getReportSummaries(COACH_ID, { limit: 100 });
    expect(page.total).toBe(BUNDLED + 1);
    const roster = await service.listCoaches();
    expect(roster.find((c) => c.id === COACH_ID)?.sessionCount).toBe(
      BUNDLED + 1,
    );
  });
});
