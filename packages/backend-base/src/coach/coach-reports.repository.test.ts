import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachReportsRepository } from "./repository/coach-reports.repository";

const conn = Database.getOrCreateConnection();
const repo = new CoachReportsRepository(Database);

function row(id: string, coach: string, date: string, extra = {}) {
  return {
    id,
    coach_id: coach,
    session_date: date,
    legacy_ids: [] as string[],
    summary: { session: `S ${date}`, score: 70, ...extra },
    metrics: { clusters: [], dimensions: [] },
    body: { bigIdeas: ["x"] },
  };
}

async function clear() {
  await conn.deleteFrom("coach_reports").execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
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

    const byNew = await repo.getDetail("retitled-slug");
    expect(byNew?.id).toBe("orig-slug"); // old link resolves to the same report
    const byOrig = await repo.getDetail("orig-slug");
    expect(byOrig?.id).toBe("orig-slug");
  });

  it("returns null for an unknown id (never a different session)", async () => {
    await repo.upsert(row("a", "c1", "2026-08-22"));
    expect(await repo.getDetail("does-not-exist")).toBeNull();
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
    await repo.upsert(row("r1", "c1", "2026-08-01"));
    const m1 = await repo.bumpMeta("2026-08-25");
    expect(m1.reportCount).toBe(1);
    await repo.upsert(row("r2", "c1", "2026-08-08"));
    const m2 = await repo.bumpMeta();
    expect(m2.reportCount).toBe(2);
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
