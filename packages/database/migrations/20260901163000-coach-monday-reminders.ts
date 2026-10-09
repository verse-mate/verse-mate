import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_monday_reminders")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("run_date", "date", (col) => col.notNull())
    .addColumn("kind", "text", (col) =>
      col.notNull().check(sql`kind IN ('leader', 'class')`),
    )
    .addColumn("coach_id", "text")
    .addColumn("rotating_class_id", "integer")
    .addColumn("found", "boolean", (col) => col.notNull())
    .addColumn("outcome", "text", (col) =>
      col
        .notNull()
        .check(
          sql`outcome IN ('sent', 'skipped', 'failed', 'not-needed', 'checked-by-class')`,
        ),
    )
    .addColumn("email", "text")
    .addColumn("reason", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await sql`
    CREATE UNIQUE INDEX coach_monday_reminders_one_uidx
    ON coach_monday_reminders (run_date, kind, coalesce(coach_id, ''), coalesce(rotating_class_id, 0))
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_monday_reminders");
  await db.schema.dropTable("coach_monday_reminders").ifExists().execute();
}
