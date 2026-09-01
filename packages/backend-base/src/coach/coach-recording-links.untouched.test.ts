import { afterEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

const conn = Database.getOrCreateConnection();
const COACH = "links-untouched-coach";

async function cleanup() {
  await conn
    .deleteFrom("coach_recording_links")
    .where("coach_id", "=", COACH)
    .execute();
  await conn
    .deleteFrom("coach_session_assets")
    .where("coach_id", "=", COACH)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

/**
 * Task 4.5a. `coach_recording_links` holds links an admin PASTED — material
 * VerseMate does not host. They are explicitly out of scope for the archive
 * requirement, and retiring them is not part of this change. This is the guard
 * that the archive work left them alone.
 */
describe("admin-pasted external links are unaffected by the archive", () => {
  afterEach(cleanup);

  it("the table still exists with its own key, untouched by this change", async () => {
    const cols = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'coach_recording_links'
    `.execute(conn);
    const names = new Set(cols.rows.map((r) => r.column_name));
    for (const c of ["coach_id", "report_id", "recording_url"]) {
      expect(names.has(c)).toBe(true);
    }
    // The archive did NOT absorb them into coach_session_assets.
    expect(names.has("storage_key")).toBe(false);
  });

  it("a pasted link survives a retained asset being written for the same session", async () => {
    await conn
      .insertInto("coach_reports")
      .values({
        id: "links-1",
        coach_id: COACH,
        session_date: "2026-08-01",
        source_session_id: "ff-links-1",
        legacy_ids: [],
        summary: {},
        metrics: {},
        body: {},
      })
      .execute();
    await conn
      .insertInto("coach_recording_links")
      .values({
        coach_id: COACH,
        report_id: "links-1",
        recording_url: "https://drive.example/admin-pasted",
      })
      .execute();

    await conn
      .insertInto("coach_session_assets")
      .values({
        coach_id: COACH,
        source_session_id: "ff-links-1",
        report_id: "links-1",
        kind: "recording",
        storage_key: "coach/ff-links-1/recording.mp4",
      })
      .execute();

    const link = await conn
      .selectFrom("coach_recording_links")
      .select("recording_url")
      .where("coach_id", "=", COACH)
      .executeTakeFirstOrThrow();
    expect(link.recording_url).toBe("https://drive.example/admin-pasted");
  });
});
