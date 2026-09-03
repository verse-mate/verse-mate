import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachReportsRepository } from "./repository/coach-reports.repository";

const conn = Database.getOrCreateConnection();
const repo = new CoachReportsRepository(Database);

const COACH = "session-key-coach";

function row(id: string, sourceSessionId: string, date = "2026-08-22") {
  return {
    id,
    coach_id: COACH,
    session_date: date,
    source_session_id: sourceSessionId,
    legacy_ids: [] as string[],
    summary: { session: `S ${sourceSessionId}`, score: 70 },
    metrics: { clusters: [], dimensions: [] },
    body: { bigIdeas: ["x"] },
  };
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

describe("the reports natural key disambiguates by source session", () => {
  beforeEach(clear);
  afterAll(clear);

  it("two sessions for one leader on one date become two reports with distinct ids", async () => {
    const morning = await repo.upsert(row("r-morning", "ff-morning"));
    const evening = await repo.upsert(row("r-evening", "ff-evening"));

    expect(morning.created).toBe(true);
    expect(evening.created).toBe(true);
    expect(morning.id).not.toBe(evening.id);

    const stored = await conn
      .selectFrom("coach_reports")
      .select(["id", "source_session_id"])
      .where("coach_id", "=", COACH)
      .execute();
    expect(stored.length).toBe(2);
  });

  it("the same source session ingested twice updates in place and keeps its id", async () => {
    const first = await repo.upsert(row("r-1", "ff-same"));
    // re-polled, and re-titled: a different proposed id for the SAME session
    const second = await repo.upsert(row("r-1-retitled", "ff-same"));

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe("r-1");

    const stored = await conn
      .selectFrom("coach_reports")
      .select(["id", "legacy_ids"])
      .where("coach_id", "=", COACH)
      .execute();
    expect(stored.length).toBe(1);
    // the delivered link built from the old id must still resolve
    expect(stored[0].legacy_ids).toContain("r-1-retitled");
  });

  it("a write retried after an interrupted attempt is idempotent", async () => {
    await repo.upsert(row("r-retry", "ff-retry"));
    await repo.upsert(row("r-retry", "ff-retry"));
    await repo.upsert(row("r-retry", "ff-retry"));

    const stored = await conn
      .selectFrom("coach_reports")
      .select(["id", "legacy_ids"])
      .where("coach_id", "=", COACH)
      .execute();
    expect(stored.length).toBe(1);
    // re-proposing the SAME id must not append it to its own legacy list
    expect(stored[0].legacy_ids).toEqual([]);
  });

  it("source_session_id is NOT NULL, a nullable column would leave the guard off for backfilled rows", async () => {
    await expect(
      conn
        .insertInto("coach_reports")
        .values({
          id: "r-null",
          coach_id: COACH,
          session_date: "2026-08-22",
          source_session_id: null as any,
          legacy_ids: [],
          summary: {},
          metrics: {},
          body: {},
        })
        .execute(),
    ).rejects.toThrow();
  });
});
