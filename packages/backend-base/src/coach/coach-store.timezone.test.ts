/**
 * Timezone guard for the report store.
 *
 * `session_date` is a DATE column. pg parses a DATE at LOCAL midnight, so
 * `new Date(...).toISOString().slice(0,10)` returns the PREVIOUS day on any
 * UTC+ host — every date the store served was a day early in Europe/Asia, and
 * the suite stayed green because the dev machine sits at UTC-3.
 *
 * This file SETS the timezone itself rather than relying on a shell prefix, so
 * the guard fires on every run regardless of where CI happens to sit.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachReportsRepository } from "./repository/coach-reports.repository";

const conn = Database.getOrCreateConnection();
const repo = new CoachReportsRepository(Database);
const COACH = "tz-guard-coach";
const ORIGINAL_TZ = process.env.TZ;

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

describe("dates under a positive-offset timezone (UTC+9)", () => {
  beforeAll(async () => {
    // Tokyo is UTC+9: the offset that broke every read path.
    process.env.TZ = "Asia/Tokyo";
    await clear();
  });
  afterAll(async () => {
    await clear();
    if (ORIGINAL_TZ === undefined) Reflect.deleteProperty(process.env, "TZ");
    else process.env.TZ = ORIGINAL_TZ;
  });

  it("every read path returns the stored calendar date, not the day before", async () => {
    await repo.upsert({
      id: "tz-report",
      coach_id: COACH,
      session_date: "2026-08-22",
      legacy_ids: [],
      summary: { session: "Joel", score: 70 },
      metrics: {},
      body: {},
    });

    expect((await repo.getDetail(COACH, "tz-report"))?.date).toBe("2026-08-22");
    expect((await repo.listSummaries(COACH))[0].date).toBe("2026-08-22");
    expect((await repo.listFullReports(COACH))[0].date).toBe("2026-08-22");
    expect((await repo.listMetrics(COACH))[0].date).toBe("2026-08-22");
    const all = await repo.listAllMetrics();
    expect(all.find((r) => r.id === "tz-report")?.date).toBe("2026-08-22");
    const roster = await repo.summaryByCoach();
    expect(roster.get(COACH)?.latest?.date).toBe("2026-08-22");
  });
});
