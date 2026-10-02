import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import coachDataJson from "./coach.data.json";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const service = new CoachService(Database);
const COACH = (coachDataJson as unknown as { coaches: Array<{ id: string }> })
  .coaches[0].id;

async function storeReport(id: string, date: string) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: COACH,
      session_date: date,
      source_session_id: `ff-${id}`,
      legacy_ids: [],
      summary: {
        dateLabel: date,
        session: "S",
        topic: "Joel",
        duration: 60,
        attendees: 9,
        newcomers: 1,
        score: 70,
        status: "On Target",
        statusEmoji: "🟢",
        docUrl: "",
        pdfUrl: "",
      },
      metrics: {
        base: 60,
        newcomerBonus: 5,
        sizeBonus: 5,
        clusters: [],
        dimensions: [],
      },
      body: { bigIdeas: [], feedback: { headline: "" } },
    })
    .execute();
}

async function clear() {
  await conn
    .deleteFrom("coach_session_assets")
    .where("source_session_id", "like", "ff-admin-list-%")
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("id", "like", "admin-list-%")
    .execute();
}

describe("an admin drilling into a leader sees which sessions VerseMate holds a recording for", () => {
  beforeEach(clear);
  afterEach(clear);

  it("every report in the admin list carries hasRetainedRecording, true only where material is retained", async () => {
    await storeReport("admin-list-held", "2099-02-01");
    await storeReport("admin-list-bare", "2099-01-01");
    await conn
      .insertInto("coach_session_assets")
      .values({
        coach_id: COACH,
        source_session_id: "ff-admin-list-held",
        report_id: "admin-list-held",
        kind: "recording",
        storage_key: "coach/sessions/ff-admin-list-held/recording.mp4",
      })
      .execute();

    const reports = await service.getReportsById(COACH);
    expect(reports).not.toBeNull();
    const byId = new Map((reports ?? []).map((r) => [r.id, r]));
    expect(byId.get("admin-list-held")?.hasRetainedRecording).toBe(true);
    expect(byId.get("admin-list-bare")?.hasRetainedRecording).toBe(false);
    expect(
      (reports ?? []).every((r) => typeof r.hasRetainedRecording === "boolean"),
    ).toBe(true);
    expect(JSON.stringify(reports)).not.toContain("recording.mp4");
  });
});
