import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20261011150000-coach-reports-and-roster";

/**
 * Class Setup becomes the notetaker's schedule.
 *
 * A class the notetaker records needs a time of day and a time zone, which
 * `coach_classes` never had (only a date and a recurrence). `notetaker` lets a
 * leader keep a class listed without the bot joining it.
 *
 * A program admin can now schedule a class for a leader who has no VerseMate
 * account yet: such a row has no `user_id`, only the leader's roster id
 * (`coach_id`). A leader's own rows carry both, so the leader sees every class
 * scheduled for them once they sign in.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await db.schema
    .alterTable("coach_classes")
    // Local start time, 24-hour HH:MM, in `time_zone`.
    .addColumn("start_time", "text", (col) =>
      col.check(sql`start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    )
    // IANA zone name, e.g. America/Chicago.
    .addColumn("time_zone", "text")
    .addColumn("notetaker", "boolean", (col) => col.notNull().defaultTo(true))
    // The roster leader the class belongs to (coach_reports.coach_id's key).
    .addColumn("coach_id", "text")
    .execute();
  await db.schema
    .alterTable("coach_classes")
    .alterColumn("user_id", (col) => col.dropNotNull())
    .execute();
  await sql`ALTER TABLE coach_classes ADD CONSTRAINT coach_classes_owner_check CHECK (user_id IS NOT NULL OR coach_id IS NOT NULL)`.execute(
    db,
  );
  await db.schema
    .createIndex("coach_classes_coach_id_idx")
    .on("coach_classes")
    .column("coach_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Rows only an admin scheduled (no account) cannot survive user_id NOT NULL,
  // and the times would be lost with their columns.
  await refuseToDrop(
    db,
    "coach_classes",
    "user_id IS NULL OR start_time IS NOT NULL OR time_zone IS NOT NULL OR notetaker = false",
  );
  await db.deleteFrom("coach_classes").where("user_id", "is", null).execute();
  await db.schema.dropIndex("coach_classes_coach_id_idx").ifExists().execute();
  await sql`ALTER TABLE coach_classes DROP CONSTRAINT IF EXISTS coach_classes_owner_check`.execute(
    db,
  );
  await db.schema
    .alterTable("coach_classes")
    .alterColumn("user_id", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("coach_classes")
    .dropColumn("start_time")
    .dropColumn("time_zone")
    .dropColumn("notetaker")
    .dropColumn("coach_id")
    .execute();
}
