import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { snapshotReportsByCoach } from "./coach-store.snapshot";
import { CoachReportsRepository } from "./repository/coach-reports.repository";

const conn = Database.getOrCreateConnection();
const repo = new CoachReportsRepository(Database);
const COACH = "snapshot-coach";

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

describe("store → bundle snapshot (rollback path)", () => {
  beforeEach(clear);
  afterAll(clear);

  it("round-trips store rows back into the bundled report shape", async () => {
    await repo.upsert({
      id: "snap-1",
      coach_id: COACH,
      session_date: "2026-08-01",
      legacy_ids: [],
      summary: { session: "Joel 1", topic: "Joel", score: 71, pdfUrl: "u" },
      metrics: {
        clusters: [{ name: "Teaching Craft", weight: 33 }],
        dimensions: [],
      },
      body: { bigIdeas: ["locusts"], feedback: { headline: "solid" } },
    });

    const byCoach = await snapshotReportsByCoach();
    const reports = byCoach[COACH];
    expect(reports?.length).toBe(1);
    const r = reports[0];
    // identity + every column reassembled into the bundle contract
    expect(r.id).toBe("snap-1");
    expect(r.date).toBe("2026-08-01");
    expect(r.session).toBe("Joel 1");
    expect(r.pdfUrl).toBe("u");
    expect(r.bigIdeas).toEqual(["locusts"]);
    expect((r.clusters as unknown[]).length).toBe(1);
  });

  it("orders a coach's reports newest-first, matching the bundle contract", async () => {
    await repo.upsert({
      id: "old",
      coach_id: COACH,
      session_date: "2026-08-01",
      legacy_ids: [],
      summary: {},
      metrics: {},
      body: {},
    });
    await repo.upsert({
      id: "new",
      coach_id: COACH,
      session_date: "2026-08-20",
      legacy_ids: [],
      summary: {},
      metrics: {},
      body: {},
    });
    const byCoach = await snapshotReportsByCoach();
    expect(byCoach[COACH].map((r) => r.id)).toEqual(["new", "old"]);
  });
});
