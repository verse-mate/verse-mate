import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Bible-Coach portal: per-session recording link.
 *
 * A session's report is served from the bundled dataset; the recording URL
 * (Zoom / Fireflies / Drive) is admin-editable and overlaid onto the report at
 * serve time. Keyed by (coach_id, report_id) — the same string ids used in the
 * dataset — so it needs no foreign key into a reports table (there isn't one).
 * One row per session.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_recording_links table...");

  await db.schema
    .createTable("coach_recording_links")
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("report_id", "text", (col) => col.notNull())
    .addColumn("recording_url", "text", (col) => col.defaultTo("").notNull())
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addPrimaryKeyConstraint("coach_recording_links_pkey", [
      "coach_id",
      "report_id",
    ])
    .execute();

  console.log("coach_recording_links table created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping coach_recording_links table...");

  await db.schema.dropTable("coach_recording_links").execute();

  console.log("coach_recording_links table dropped successfully");
}
