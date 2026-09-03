/**
 * Migration-gate fallback: while the store holds no rows for a coach, the
 * compiled-in bundle still answers. That is the whole "ship before the backfill
 * runs" story, and every branch of it was previously unasserted, each could be
 * deleted with the suite green, which in production meant a blank session list
 * or an admin unable to attach a note to a not-yet-backfilled session.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import coachDataJson from "./coach.data.json";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const service = new CoachService(Database);

// A coach that exists in the BUNDLE. The store deliberately holds nothing for
// them, so every read below must come from the bundle.
const bundled = (coachDataJson as { coaches: any[] }).coaches[0];
const COACH_ID: string = bundled.id;
const BUNDLED_REPORT_ID: string = bundled.reports[0].id;

async function clearStoreForCoach() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH_ID)
    .execute();
}

describe("bundle fallback while the store is not yet backfilled", () => {
  beforeAll(clearStoreForCoach);
  afterAll(clearStoreForCoach);

  it("getReportSummaries falls back to the bundled reports (not an empty list)", async () => {
    const page = await service.getReportSummaries(COACH_ID, { limit: 5 });
    expect(page.total).toBe(bundled.reports.length);
    expect(page.items.length).toBeGreaterThan(0);
    // the list card fields must survive the fallback projection
    expect(page.items[0]).toHaveProperty("pdfUrl");
    expect(page.items[0]).toHaveProperty("topic");
  });

  it("getReportDetail resolves a bundled report id", async () => {
    const detail = await service.getReportDetail(COACH_ID, BUNDLED_REPORT_ID);
    expect(detail?.id).toBe(BUNDLED_REPORT_ID);
    expect(detail?.session).toBeTruthy();
  });

  it("getReportDetail still refuses another coach's bundled report", async () => {
    const other = (coachDataJson as { coaches: any[] }).coaches.find(
      (c) => c.id !== COACH_ID && c.reports.length > 0,
    );
    expect(other).toBeTruthy();
    // SECURITY: the fallback must be coach-scoped too, not a global search
    const leaked = await service.getReportDetail(COACH_ID, other.reports[0].id);
    expect(leaked).toBeNull();
  });
});
