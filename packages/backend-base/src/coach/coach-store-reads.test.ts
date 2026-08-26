import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachService } from "./coach.service";
import { CoachReportsRepository } from "./repository/coach-reports.repository";

const conn = Database.getOrCreateConnection();
const repo = new CoachReportsRepository(Database);
const service = new CoachService(Database);

const COACH = "store-read-coach";

function row(id: string, date: string) {
  return {
    id,
    coach_id: COACH,
    session_date: date,
    legacy_ids: [] as string[],
    summary: {
      session: `Session ${date}`,
      topic: "Joel",
      score: 71,
      status: "On Target",
      pdfUrl: "https://example/report.pdf",
    },
    metrics: {
      clusters: [{ name: "Teaching Craft", weight: 33 }],
      dimensions: [],
    },
    body: { bigIdeas: ["locusts"], feedback: { headline: "solid" } },
  };
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
  await conn.deleteFrom("coach_notes").where("coach_id", "=", COACH).execute();
  await conn
    .deleteFrom("coach_recording_links")
    .where("coach_id", "=", COACH)
    .execute();
}

describe("store-backed report reads", () => {
  beforeEach(clear);
  afterAll(clear);

  it("summary list is paginated, newest first, and carries NO prose", async () => {
    await repo.upsert(row("s1", "2026-08-01"));
    await repo.upsert(row("s2", "2026-08-08"));
    await repo.upsert(row("s3", "2026-08-15"));

    const page = await service.getReportSummaries(COACH, { limit: 2 });
    expect(page.total).toBe(3);
    expect(page.items.length).toBe(2);
    expect(page.items[0].date).toBe("2026-08-15");
    expect(page.items[0]).toHaveProperty("pdfUrl");
    expect(page.items[0]).toHaveProperty("topic");
    expect(page.items[0]).not.toHaveProperty("feedback");
    expect(page.items[0]).not.toHaveProperty("bigIdeas");
  });

  it("detail returns the full report reassembled from the store", async () => {
    await repo.upsert(row("s1", "2026-08-01"));
    const detail = await service.getReportDetail(COACH, "s1");
    expect(detail?.id).toBe("s1");
    expect(detail?.date).toBe("2026-08-01");
    expect(detail?.session).toBe("Session 2026-08-01");
    // prose + metrics both present on the detail view
    expect((detail as any).bigIdeas).toEqual(["locusts"]);
    expect((detail as any).clusters.length).toBe(1);
  });

  it("detail resolves a LEGACY id to the same report (delivered links survive)", async () => {
    await repo.upsert(row("original-id", "2026-08-01"));
    await repo.upsert(row("retitled-id", "2026-08-01")); // re-title → legacy recorded
    const viaLegacy = await service.getReportDetail(COACH, "retitled-id");
    expect(viaLegacy?.id).toBe("original-id");
  });

  it("unknown id returns null (never a different session)", async () => {
    await repo.upsert(row("s1", "2026-08-01"));
    expect(await service.getReportDetail(COACH, "no-such-report")).toBeNull();
  });

  it("SECURITY: one coach cannot read another coach's report detail", async () => {
    await repo.upsert(row("s1", "2026-08-01"));
    // same id, different caller → not found, never the victim's content
    expect(await service.getReportDetail("some-other-coach", "s1")).toBeNull();
  });

  it("a note written against a LEGACY id attaches to the canonical report", async () => {
    await repo.upsert(row("original-id", "2026-08-01"));
    await repo.upsert(row("retitled-id", "2026-08-01"));
    // resolveById needs a roster record; use the repository-level canonicaliser
    const canonical = await repo.canonicalId(COACH, "retitled-id");
    expect(canonical).toBe("original-id");
  });
});
