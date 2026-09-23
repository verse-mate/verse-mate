import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { db as Database } from "database";

import { ReportSchema } from "./coach.schema";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const service = new CoachService(Database);
const COACH = "optional-docs-coach";

/** Everything the read contract requires, minus the Drive fields. */
function reportWithoutDriveLinks() {
  return {
    coachId: COACH,
    date: "2026-08-22",
    sourceSessionId: "ff-nodrive",
    summary: {
      dateLabel: "22 Aug 2026",
      session: "Obadiah",
      topic: "Obadiah",
      duration: "60 min",
      attendees: 9,
      newcomers: 1,
      score: 70,
      status: "On Target",
      statusEmoji: "🟡",
    },
    metrics: {
      base: 60,
      newcomerBonus: 5,
      sizeBonus: 5,
      clusters: [],
      dimensions: [],
    },
    body: { bigIdeas: ["x"], feedback: { headline: "ok" } },
  };
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

describe("a report produced without a Drive doc is valid", () => {
  beforeEach(clear);
  afterEach(clear);

  it("the response contract does not REQUIRE docUrl or pdfUrl", () => {
    // They were t.String(), unlike every optional field beside them, so the
    // first report produced without a Drive doc would have failed response
    // validation, and the leader's whole session list fails with it (the array
    // is validated as a whole).
    const report = {
      id: "r1",
      date: "2026-08-22",
      dateLabel: "22 Aug 2026",
      session: "Obadiah",
      topic: "Obadiah",
      duration: "60 min",
      attendees: 9,
      newcomers: 1,
      score: 70,
      base: 60,
      newcomerBonus: 5,
      sizeBonus: 5,
      status: "On Target",
      statusEmoji: "🟡",
      clusters: [],
      dimensions: [],
      bigIdeas: ["x"],
      feedback: {
        headline: "ok",
        strengths: [],
        improvements: [],
        recommendations: [],
      },
    };
    expect(Value.Check(ReportSchema, report)).toBe(true);
  });

  it("a report still validates WITH them, so backfilled reports are unaffected", () => {
    const report = {
      id: "r1",
      date: "2026-08-22",
      dateLabel: "22 Aug 2026",
      session: "Obadiah",
      topic: "Obadiah",
      duration: "60 min",
      attendees: 9,
      newcomers: 1,
      score: 70,
      base: 60,
      newcomerBonus: 5,
      sizeBonus: 5,
      status: "On Target",
      statusEmoji: "🟡",
      clusters: [],
      dimensions: [],
      bigIdeas: ["x"],
      feedback: {
        headline: "ok",
        strengths: [],
        improvements: [],
        recommendations: [],
      },
      docUrl: "https://drive.example/doc",
      pdfUrl: "https://drive.example/pdf",
    };
    expect(Value.Check(ReportSchema, report)).toBe(true);
  });

  it("the write boundary no longer demands them either", async () => {
    // Requiring them at ingest would have been the same wall one step earlier:
    // no Drive stage exists after this change, so nothing can supply them.
    const result = await service.ingestReports({
      reports: [reportWithoutDriveLinks()],
    });
    expect(result.accepted.length).toBe(1);
  });

  it("the write boundary still demands the fields a reader actually needs", async () => {
    const missingScore = reportWithoutDriveLinks();
    // biome-ignore lint/performance/noDelete: exercising a missing key
    delete (missingScore.summary as Record<string, unknown>).score;
    await expect(
      service.ingestReports({ reports: [missingScore] }),
    ).rejects.toThrow(/score/);
  });
});
