import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const COACH = "attached-rec-coach";
const EMAIL = "attached-rec@example.test";
const REPORT = "attached-rec-report";
const ZOOM = "https://zoom.us/j/123456789";
const ATTACHED = "https://drive.example.test/recording.mp4";

let userId = "";

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
  await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
}

async function everyShape(service: CoachService) {
  const leaderList = (await service.getReports(userId)) ?? [];
  const adminList = (await service.getReportsById(COACH)) ?? [];
  const detail = await service.getReportDetail(COACH, REPORT);
  return [leaderList[0], adminList[0], detail];
}

describe("the attached recording is only ever an admin's link", () => {
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: COACH, email: EMAIL, name: "Attached Rec" })
      .execute();
    userId = (
      await conn
        .insertInto("user")
        .values({
          email: EMAIL,
          firstName: "A",
          lastName: "R",
          emailVerified: true,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    await conn
      .insertInto("coach_reports")
      .values({
        id: REPORT,
        coach_id: COACH,
        session_date: "2026-09-05",
        source_session_id: `ff-${REPORT}`,
        legacy_ids: [],
        summary: { session: "s", dateLabel: "Sep 5" },
        metrics: { dimensions: [], clusters: [] },
        body: {},
      })
      .execute();
    await new CoachService(Database).setZoomLink(userId, ZOOM);
  });
  afterEach(clear);

  it("a saved meeting link never reaches attachedRecordingUrl", async () => {
    for (const report of await everyShape(new CoachService(Database))) {
      expect(report).toBeTruthy();
      expect(report?.attachedRecordingUrl).toBeNull();
    }
  });

  it("recordingUrl keeps its meeting-link fallback", async () => {
    const [leaderRow] = await everyShape(new CoachService(Database));
    expect(leaderRow?.recordingUrl).toBe(ZOOM);
  });

  it("an admin's link is attachedRecordingUrl on the list and the detail", async () => {
    const service = new CoachService(Database);
    await service.setRecordingLink(COACH, REPORT, ATTACHED);
    for (const report of await everyShape(service)) {
      expect(report?.attachedRecordingUrl).toBe(ATTACHED);
    }
  });

  it("an admin clearing the link leaves no attached recording", async () => {
    const service = new CoachService(Database);
    await service.setRecordingLink(COACH, REPORT, ATTACHED);
    await service.setRecordingLink(COACH, REPORT, "");
    for (const report of await everyShape(service)) {
      expect(report?.attachedRecordingUrl).toBeNull();
    }
  });
});
