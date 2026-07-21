import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Bible-Coach portal: per-session coaching notes.
 *
 * A program admin writes a note on a specific leader's session; the note is
 * persisted here, emailed to the leader, and rendered read-only on the leader's
 * own dashboard. Keyed by (coach_id, report_id) — the dataset's string ids —
 * with full history (many notes per session), newest first at read time.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_notes table...");

  await db.schema
    .createTable("coach_notes")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("report_id", "text", (col) => col.notNull())
    .addColumn("author_user_id", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("body", "text", (col) => col.notNull())
    // True once the note was successfully handed to the mailer.
    .addColumn("emailed", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  await db.schema
    .createIndex("coach_notes_coach_report_idx")
    .on("coach_notes")
    .columns(["coach_id", "report_id"])
    .execute();

  console.log("coach_notes table created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping coach_notes table...");

  await db.schema.dropTable("coach_notes").execute();

  console.log("coach_notes table dropped successfully");
}
