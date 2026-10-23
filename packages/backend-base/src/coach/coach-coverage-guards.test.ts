import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { db as Database } from "database";

import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const COACH = "guard-merge-coach";

async function stored(id: string, date: string, source: string) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: COACH,
      session_date: date,
      source_session_id: source,
      legacy_ids: [],
      summary: JSON.stringify({
        dateLabel: date,
        session: `stored ${date}`,
        score: 70,
        status: "Strong",
      }),
      metrics: JSON.stringify({ clusters: [], dimensions: [] }),
      body: {},
    })
    .execute();
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

describe("a leader's session list is paginated in the database", () => {
  beforeEach(async () => {
    await clear();
    await stored("guard-june", "2026-06-01", `legacy:${COACH}:2026-06-01`);
    await stored("guard-july", "2026-07-01", `legacy:${COACH}:2026-07-01`);
    await stored("guard-august", "2026-08-01", "ff-guard-august");
  });
  afterEach(clear);

  it("one page loads one page, not the whole corpus", async () => {
    const service = new CoachService(Database);
    const repo = (service as unknown as { reportsRepository: object })
      .reportsRepository as {
      listFullReports: (...a: unknown[]) => unknown;
      listSummaries: (...a: unknown[]) => unknown;
    };
    const full = spyOn(repo, "listFullReports");
    const paged = spyOn(repo, "listSummaries");

    const page = await service.getReportSummaries(COACH, { limit: 1 });

    expect(page.total).toBe(3);
    expect(page.items.map((r) => r.date)).toEqual(["2026-08-01"]);
    expect(full).not.toHaveBeenCalled();
    expect(paged).toHaveBeenCalledTimes(1);
  });
});
