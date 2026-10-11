import { afterEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

const conn = Database.getOrCreateConnection();
const COACH = "archive-probe";

async function cleanup() {
  await conn
    .deleteFrom("coach_session_assets")
    .where("coach_id", "=", COACH)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

describe("retained session material is tracked in the database", () => {
  afterEach(cleanup);

  it("a recording and a transcript are recorded against the SOURCE session", async () => {
    // Keyed on the source session, not the report: material is retrieved and
    // retained before a report exists for it.
    await conn
      .insertInto("coach_session_assets")
      .values([
        {
          coach_id: COACH,
          source_session_id: "ff-1",
          kind: "recording",
          storage_key: "coach/ff-1/recording.mp4",
          byte_size: "1048576",
          content_type: "video/mp4",
        },
        {
          coach_id: COACH,
          source_session_id: "ff-1",
          kind: "transcript",
          storage_key: "coach/ff-1/transcript.json",
          content_type: "application/json",
        },
      ])
      .execute();
    const rows = await conn
      .selectFrom("coach_session_assets")
      .selectAll()
      .where("coach_id", "=", COACH)
      .orderBy("kind")
      .execute();
    expect(rows.map((r) => r.kind)).toEqual(["recording", "transcript"]);
    expect(rows[0].report_id).toBeNull();
  });

  it("one asset per session and kind, a re-poll cannot stage a second copy", async () => {
    await conn
      .insertInto("coach_session_assets")
      .values({
        coach_id: COACH,
        source_session_id: "ff-2",
        kind: "recording",
        storage_key: "a",
      })
      .execute();
    await expect(
      conn
        .insertInto("coach_session_assets")
        .values({
          coach_id: COACH,
          source_session_id: "ff-2",
          kind: "recording",
          storage_key: "b",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("an unknown kind is refused", async () => {
    await expect(
      sql`
        INSERT INTO coach_session_assets (coach_id, source_session_id, kind, storage_key)
        VALUES (${COACH}, 'ff-3', 'screenshot', 'x')
      `.execute(conn),
    ).rejects.toThrow();
  });

  it("material is removed with the report it belongs to", async () => {
    await conn
      .insertInto("coach_reports")
      .values({
        id: "arch-1",
        coach_id: COACH,
        session_date: "2026-08-01",
        source_session_id: "ff-4",
        legacy_ids: [],
        summary: {},
        metrics: {},
        body: {},
      })
      .execute();
    await conn
      .insertInto("coach_session_assets")
      .values({
        coach_id: COACH,
        source_session_id: "ff-4",
        report_id: "arch-1",
        kind: "recording",
        storage_key: "coach/ff-4/recording.mp4",
      })
      .execute();

    await conn.deleteFrom("coach_reports").where("id", "=", "arch-1").execute();
    const left = await conn
      .selectFrom("coach_session_assets")
      .select("id")
      .where("source_session_id", "=", "ff-4")
      .execute();
    expect(left.length).toBe(0);
  });

  it("retention is bounded by the REPORT's lifetime, through the cascade", async () => {
    // There was a `retained_until` column here, described as the horizon the
    // prune reads. Nothing ever wrote it and the prune is a per-leader count
    // ("keep the four most recent"), so the column was dead schema attached to
    // a claim about the design that was not true. What actually bounds an
    // asset is its report: delete the report and the asset row goes with it.
    await conn
      .insertInto("coach_reports")
      .values({
        id: "r-cascade",
        coach_id: COACH,
        session_date: "2026-08-22",
        source_session_id: "ff-5",
        legacy_ids: [],
        summary: {},
        metrics: {},
        body: {},
      })
      .execute();
    await conn
      .insertInto("coach_session_assets")
      .values({
        coach_id: COACH,
        source_session_id: "ff-5",
        kind: "recording",
        storage_key: "x",
        report_id: "r-cascade",
      })
      .execute();

    await conn
      .deleteFrom("coach_reports")
      .where("id", "=", "r-cascade")
      .execute();
    const left = await conn
      .selectFrom("coach_session_assets")
      .select("id")
      .where("source_session_id", "=", "ff-5")
      .execute();
    expect(left).toEqual([]);
  });
});
