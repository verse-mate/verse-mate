import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Migration 7 of 9 (change: port-coach-pipeline, design D13).
 *
 * Where a session's retained recording and transcript live, so a report's
 * evidence survives the provider's original share link expiring.
 *
 * Keyed on `source_session_id`, not on the report: material is retrieved and
 * staged BEFORE a report exists for it (a session can be held and retried for
 * days), so a report-keyed table could not record what it is holding. When the
 * report is produced, `report_id` is filled in, and the ON DELETE CASCADE is
 * what makes "remove a session's material when its report is deleted" a
 * database guarantee rather than a step someone has to remember.
 *
 * This table does NOT cover `coach_recording_links`. Those are admin-pasted
 * external URLs that VerseMate does not host; they are explicitly out of scope
 * for the archive requirement and are left untouched.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_session_assets ...");
  await db.schema
    .createTable("coach_session_assets")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("source_session_id", "text", (col) => col.notNull())
    // Filled once the session has a report; CASCADE is the retention guarantee.
    .addColumn("report_id", "text", (col) =>
      col.references("coach_reports.id").onDelete("cascade"),
    )
    .addColumn("kind", "text", (col) =>
      col.notNull().check(sql`kind IN ('recording', 'transcript')`),
    )
    .addColumn("storage_key", "text", (col) => col.notNull())
    .addColumn("byte_size", "bigint")
    .addColumn("content_type", "text")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  // One artifact per session and kind: a re-poll of an already-retained session
  // must not stage a second copy of the same video.
  await db.schema
    .createIndex("coach_session_assets_session_kind_uidx")
    .unique()
    .on("coach_session_assets")
    .columns(["source_session_id", "kind"])
    .execute();

  // The per-leader retention window ("keep the four most recent recordings")
  // reads newest-first per leader and kind.
  await db.schema
    .createIndex("coach_session_assets_coach_kind_created_idx")
    .on("coach_session_assets")
    .columns(["coach_id", "kind", "created_at"])
    .execute();

  console.log("coach_session_assets created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("coach_session_assets").ifExists().execute();
}
