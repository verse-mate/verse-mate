import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachReportsRepository } from "./repository/coach-reports.repository";

const conn = Database.getOrCreateConnection();
const repo = new CoachReportsRepository(Database);

// A report's source session, not its id: these cases model ONE session being
// re-published under a re-derived id, which must update the row in place. Two
// genuinely different sessions on one date are covered in
// coach-store.session-key.test.ts, which passes distinct source sessions.
function row(id: string, coach: string, date: string, extra = {}) {
  return {
    id,
    coach_id: coach,
    session_date: date,
    source_session_id: `src-${coach}-${date}`,
    legacy_ids: [] as string[],
    summary: { session: `S ${date}`, score: 70, ...extra },
    metrics: { clusters: [], dimensions: [] },
    body: { bigIdeas: ["x"] },
  };
}

// Scope every delete to the ids THIS file creates. An unscoped delete wipes the
// whole corpus on whatever database POSTGRES_URL happens to point at.
const TEST_COACHES = ["c1", "c2", "victim-coach", "attacker-coach"];

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", TEST_COACHES)
    .execute();
}

describe("CoachReportsRepository", () => {
  beforeEach(clear);
  afterAll(clear);

  it("re-publishing the same leader+date KEEPS the original id (overlay rows stay valid)", async () => {
    const first = await repo.upsert(row("orig-slug", "c1", "2026-08-22"));
    expect(first.created).toBe(true);

    // the exporter re-derives a different id after a re-title
    const second = await repo.upsert(row("retitled-slug", "c1", "2026-08-22"));
    expect(second.created).toBe(false);
    expect(second.id).toBe("orig-slug"); // identity preserved

    const all = await repo.listSummaries("c1");
    expect(all.length).toBe(1); // updated in place, no sibling row
  });

  it("records the re-derived id as a legacy id and still resolves it", async () => {
    await repo.upsert(row("orig-slug", "c1", "2026-08-22"));
    await repo.upsert(row("retitled-slug", "c1", "2026-08-22"));

    const byNew = await repo.getDetail("c1", "retitled-slug");
    expect(byNew?.id).toBe("orig-slug"); // old link resolves to the same report
    const byOrig = await repo.getDetail("c1", "orig-slug");
    expect(byOrig?.id).toBe("orig-slug");
  });

  it("returns null for an unknown id (never a different session)", async () => {
    await repo.upsert(row("a", "c1", "2026-08-22"));
    expect(await repo.getDetail("c1", "does-not-exist")).toBeNull();
  });

  it("every read path returns the stored calendar date as a STRING", async () => {
    // Renamed and re-scoped. It used to be called "dates survive a
    // positive-offset timezone (run under TZ=Europe/Berlin too)" and never set
    // TZ, the parenthetical was an instruction to a human, not a guard. Worse,
    // the ambient zone here is UTC-3, which its own comment identifies as the
    // offset that CONCEALED the original bug, so it passed against unfixed code.
    // That is COACH-1's timezone test reproduced exactly.
    //
    // `coach-store.timezone.test.ts` sets TZ=Asia/Tokyo itself and owns the
    // timezone claim. What this one can honestly assert is the mechanism the
    // fix relies on: the date never becomes a JS Date, because it is formatted
    // in SQL. If `to_char` is dropped, pg hands back a Date and this fails.
    await repo.upsert(row("tz-1", "c1", "2026-08-22"));
    const detail = await repo.getDetail("c1", "tz-1");
    expect(typeof detail?.date).toBe("string");
    expect(detail?.date).toBe("2026-08-22");
    const [summary] = await repo.listSummaries("c1");
    expect(typeof summary.date).toBe("string");
    const [full] = await repo.listFullReports("c1");
    expect(typeof full.date).toBe("string");
  });

  it("SECURITY: never returns another coach's report (cross-tenant isolation)", async () => {
    await repo.upsert(row("victim-report", "victim-coach", "2026-08-22"));
    // attacker knows the id, ids are predictable slugs, but is a different coach
    expect(await repo.getDetail("attacker-coach", "victim-report")).toBeNull();
    // the owner still gets it
    expect((await repo.getDetail("victim-coach", "victim-report"))?.id).toBe(
      "victim-report",
    );
  });

  it("canonicalises a legacy id for overlay writes", async () => {
    await repo.upsert(row("orig", "c1", "2026-08-22"));
    await repo.upsert(row("new", "c1", "2026-08-22"));
    expect(await repo.canonicalId("c1", "new")).toBe("orig");
    expect(await repo.canonicalId("c1", "nope")).toBeNull();
  });

  it("paginates list reads and never loads prose", async () => {
    await repo.upsert(row("r1", "c1", "2026-08-01"));
    await repo.upsert(row("r2", "c1", "2026-08-08"));
    await repo.upsert(row("r3", "c1", "2026-08-15"));
    const page = await repo.listSummaries("c1", { limit: 2, offset: 0 });
    expect(page.length).toBe(2);
    expect(page[0].date).toBe("2026-08-15"); // newest first
    expect(page[0]).not.toHaveProperty("body");
    expect(await repo.countForCoach("c1")).toBe(3);
  });

  it("bumpMeta advances version and syncs report_count to the real row count", async () => {
    // `report_count` is global, so this is asserted as a DELTA against a
    // baseline rather than against an absolute, the previous version wiped
    // the whole `coach_reports` table to get an absolute of 1, in the one file
    // that documents (line 26) why an unscoped delete must never appear. That
    // wipe took every other leader's reports with it, and two ON DELETE
    // CASCADEs behind them: every `provenance='human'` admin correction in
    // `coach_report_dimension_scores`, and every `coach_session_assets` row,
    // orphaning the S3 objects it pointed at. On a database POSTGRES_URL
    // happened to point at, that is the COACH-1 incident again.
    const baseline = await repo.totalReports();
    await repo.upsert(row("r1", "c1", "2026-08-01"));
    const m1 = await repo.bumpMeta("2026-08-25");
    expect(m1.reportCount).toBe(baseline + 1);
    await repo.upsert(row("r2", "c1", "2026-08-08"));
    const m2 = await repo.bumpMeta();
    expect(m2.reportCount).toBe(baseline + 2);
    expect(Number(m2.version)).toBeGreaterThan(Number(m1.version));
  });

  it("roster summary gives per-coach count and latest session", async () => {
    await repo.upsert(row("r1", "c1", "2026-08-01"));
    await repo.upsert(row("r2", "c1", "2026-08-15"));
    await repo.upsert(row("r3", "c2", "2026-08-10"));
    const map = await repo.summaryByCoach();
    expect(map.get("c1")?.count).toBe(2);
    expect(map.get("c1")?.latest?.date).toBe("2026-08-15");
    expect(map.get("c2")?.count).toBe(1);
  });
});
