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

describe("an admin's drill-in marks held duplicates and leaves them out of the stats", () => {
  const STORE_ONLY = "admin-list-store-leader";

  async function held(id: string, coachId: string, date: string) {
    await conn
      .insertInto("coach_reports")
      .values({
        id,
        coach_id: coachId,
        session_date: date,
        source_session_id: `ff-${id}`,
        legacy_ids: [],
        summary: { session: "S", score: 70 },
        metrics: {},
        body: {},
        held: true,
      })
      .execute();
  }

  beforeEach(async () => {
    await clear();
    await conn
      .deleteFrom("coach_reports")
      .where("coach_id", "=", STORE_ONLY)
      .execute();
    await conn
      .deleteFrom("coach_leaders")
      .where("slug", "=", STORE_ONLY)
      .execute();
  });
  afterEach(async () => {
    await clear();
    await conn
      .deleteFrom("coach_reports")
      .where("coach_id", "=", STORE_ONLY)
      .execute();
    await conn
      .deleteFrom("coach_leaders")
      .where("slug", "=", STORE_ONLY)
      .execute();
  });

  it("a leader whose reports all live in the store", async () => {
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: STORE_ONLY,
        email: "admin-list-store@example.test",
        name: "Store Only",
      })
      .execute();
    await conn
      .insertInto("coach_reports")
      .values({
        id: "admin-list-live",
        coach_id: STORE_ONLY,
        session_date: "2026-10-06",
        source_session_id: "ff-admin-list-live",
        legacy_ids: [],
        summary: { session: "S", score: 70 },
        metrics: {},
        body: {},
      })
      .execute();
    await held("admin-list-dup", STORE_ONLY, "2026-10-06");

    const page = await service.getReportSummaries(STORE_ONLY, {}, "admin");
    const flags = Object.fromEntries(page.items.map((i) => [i.id, i.held]));
    expect(flags).toEqual({ "admin-list-live": false, "admin-list-dup": true });
    expect(page.quarterSessions).toBe(1);
    expect(page.streakWeeks).toBe(
      (await service.getReportSummaries(STORE_ONLY)).streakWeeks,
    );
  });

  it("a bundled leader whose list merges the bundle with the store", async () => {
    const before = await service.getReportSummaries(COACH, {}, "admin");
    await held("admin-list-dup", COACH, "2026-10-06");
    const after = await service.getReportSummaries(
      COACH,
      { limit: 100 },
      "admin",
    );
    expect(after.items.find((i) => i.id === "admin-list-dup")?.held).toBe(true);
    expect(after.items.every((i) => typeof i.held === "boolean")).toBe(true);
    expect(after.quarterSessions).toBe(before.quarterSessions);
    expect(after.streakWeeks).toBe(before.streakWeeks);
  });
});
