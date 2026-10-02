import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const service = new CoachService(Database);

const COACH = "atomicity-coach";

/** A report carrying every field the read contract requires. */
function report(sourceSessionId: string, date: string, over = {}) {
  return {
    coachId: COACH,
    date,
    sourceSessionId,
    summary: {
      dateLabel: date,
      session: `S ${sourceSessionId}`,
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
    body: { bigIdeas: ["x"], feedback: { headline: "ok" } },
    ...over,
  };
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

async function storedCount(): Promise<number> {
  const r = await conn
    .selectFrom("coach_reports")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("coach_id", "=", COACH)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

describe("the batch report write is atomic", () => {
  beforeEach(clear);
  afterEach(clear);

  it("a mid-batch database error commits NOTHING and does not bump the meta version", async () => {
    // First write succeeds so a meta row exists to compare against.
    await service.ingestReports({ reports: [report("ff-1", "2026-08-01")] });
    const before = await conn
      .selectFrom("coach_dataset_meta")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(await storedCount()).toBe(1);

    // A batch whose SECOND report the database rejects: the date passes the
    // service's yyyy-mm-dd shape check but is not a real calendar date, so it
    // fails at the ::date cast, inside the loop, after report one is written.
    await expect(
      service.ingestReports({
        reports: [
          report("ff-2", "2026-08-02"),
          report("ff-3", "2026-02-31"),
          report("ff-4", "2026-08-04"),
        ],
      }),
    ).rejects.toThrow();

    // Nothing from the failed batch survives, not the report that had already
    // been written when the error hit.
    expect(await storedCount()).toBe(1);
    const after = await conn
      .selectFrom("coach_dataset_meta")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(String(after.version)).toBe(String(before.version));
    expect(after.report_count).toBe(before.report_count);
  });

  it("a batch that succeeds commits every report and bumps the version once", async () => {
    await service.ingestReports({
      reports: [
        report("ff-a", "2026-08-01"),
        report("ff-b", "2026-08-02"),
        report("ff-c", "2026-08-03"),
      ],
    });
    expect(await storedCount()).toBe(3);
    const meta = await conn
      .selectFrom("coach_dataset_meta")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(String(meta.version)).toBe("1");
  });
});
