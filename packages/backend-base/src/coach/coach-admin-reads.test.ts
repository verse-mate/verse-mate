import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const COACH = "admin-reads-coach";
const EMAIL = "admin-reads@example.test";

async function stored(id: string, date: string, held = false) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: COACH,
      session_date: date,
      source_session_id: `ff-${id}`,
      legacy_ids: [],
      summary: JSON.stringify({ dateLabel: date, session: id, score: 70 }),
      metrics: JSON.stringify({ clusters: [], dimensions: [] }),
      body: {},
      held,
    })
    .execute();
}

async function clear() {
  await conn
    .deleteFrom("coach_recording_links")
    .where("coach_id", "=", COACH)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
  await conn.deleteFrom("coach_leaders").where("email", "=", EMAIL).execute();
}

describe("the admin reads one leader's history a page at a time", () => {
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: COACH, email: EMAIL, name: "Admin Reads" })
      .execute();
    await stored("ar-sep-14", "2026-09-14");
    await stored("ar-sep-09", "2026-09-09");
    await stored("ar-sep-01", "2026-09-01", true);
    await stored("ar-aug-18", "2026-08-18");
    await stored("ar-jun-01", "2026-06-01");
  });
  afterEach(clear);

  it("an admin page includes a held report and carries the recording fields", async () => {
    const service = new CoachService(Database);
    await service.setRecordingLink(COACH, "ar-sep-09", "https://drive.test/r");
    const page = await service.getReportSummaries(COACH, { limit: 3 }, "admin");
    expect(page.total).toBe(5);
    expect(page.items.map((r) => r.id)).toEqual([
      "ar-sep-14",
      "ar-sep-09",
      "ar-sep-01",
    ]);
    expect(page.items.map((r) => r.attachedRecordingUrl)).toEqual([
      null,
      "https://drive.test/r",
      null,
    ]);
    expect(page.items.map((r) => r.hasRetainedRecording)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("a leader's own page does not include the held report", async () => {
    const page = await new CoachService(Database).getReportSummaries(COACH, {
      limit: 10,
    });
    expect(page.total).toBe(4);
    expect(page.items.map((r) => r.id)).not.toContain("ar-sep-01");
  });

  it("the admin detail route's read returns a held report", async () => {
    const report = await new CoachService(Database).getReportDetail(
      COACH,
      "ar-sep-01",
      "admin",
    );
    expect(report?.id).toBe("ar-sep-01");
    expect(report?.attachedRecordingUrl).toBeNull();
    expect(report?.hasRetainedRecording).toBe(false);
  });

  it("the streak and the quarter count come from the whole history, not the page, and leave held reports out", async () => {
    const page = await new CoachService(Database).getReportSummaries(
      COACH,
      { limit: 1 },
      "admin",
    );
    expect(page.streakWeeks).toBe(2);
    expect(page.quarterSessions).toBe(3);
  });

  it("a leader's streak does not count a session held from them", async () => {
    const page = await new CoachService(Database).getReportSummaries(COACH, {
      limit: 1,
    });
    expect(page.streakWeeks).toBe(2);
    expect(page.quarterSessions).toBe(3);
  });
});

describe("the dashboard aggregates", () => {
  it("count consecutive Monday-start weeks back from the latest session", () => {
    expect(
      CoachService.streakWeeks(["2026-09-14", "2026-09-13", "2026-08-30"]),
    ).toBe(2);
    expect(CoachService.streakWeeks(["2026-09-14", "2026-08-31"])).toBe(1);
    expect(CoachService.streakWeeks([])).toBe(0);
  });

  it("count sessions within 91 days of the latest session", () => {
    expect(
      CoachService.quarterSessions(["2026-09-14", "2026-06-15", "2026-06-14"]),
    ).toBe(2);
    expect(CoachService.quarterSessions([])).toBe(0);
  });
});
