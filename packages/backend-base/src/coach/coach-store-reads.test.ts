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
    // Same source session across a re-title: the row must update in place.
    source_session_id: `src-${date}`,
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

  it("addNote against a LEGACY id persists the CANONICAL id (notes cannot orphan)", async () => {
    // Use a coach that exists in the bundle so resolveById finds a record; the
    // store rows below shadow the bundled ones for this leader.
    const bundledCoach = (require("./coach.data.json") as { coaches: any[] })
      .coaches[0].id as string;
    await conn
      .deleteFrom("coach_reports")
      .where("coach_id", "=", bundledCoach)
      .execute();
    await conn
      .deleteFrom("coach_notes")
      .where("coach_id", "=", bundledCoach)
      .execute();

    await repo.upsert({
      ...row("original-id", "2026-08-01"),
      coach_id: bundledCoach,
    });
    await repo.upsert({
      ...row("retitled-id", "2026-08-01"),
      coach_id: bundledCoach,
    });

    // Write the note addressed by the OLD id, what a stale admin UI would send.
    const saved = await service.addNote(
      bundledCoach,
      "retitled-id",
      null,
      "note against a stale id",
    );
    expect(saved).toBeTruthy();

    // It must be stored against the report's canonical identity, or it orphans.
    const persisted = await conn
      .selectFrom("coach_notes")
      .select(["report_id", "body"])
      .where("coach_id", "=", bundledCoach)
      .executeTakeFirstOrThrow();
    expect(persisted.report_id).toBe("original-id");

    // ...and it surfaces on the report the leader actually opens.
    const detail = await service.getReportDetail(bundledCoach, "original-id");
    expect((detail as any)?.notes?.length).toBeGreaterThan(0);

    await conn
      .deleteFrom("coach_notes")
      .where("coach_id", "=", bundledCoach)
      .execute();
    await conn
      .deleteFrom("coach_reports")
      .where("coach_id", "=", bundledCoach)
      .execute();
  });
});
