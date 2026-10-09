import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_monthly_reports")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("kind", "text", (col) =>
      col.notNull().check(sql`kind IN ('leader', 'program')`),
    )
    .addColumn("coach_id", "text")
    .addColumn("month", "text", (col) =>
      col.notNull().check(sql`month ~ '^[0-9]{4}-[0-9]{2}$'`),
    )
    .addColumn("summary", "jsonb", (col) => col.notNull())
    .addColumn("state", "text", (col) =>
      col
        .notNull()
        .check(
          sql`state IN ('held', 'pending', 'sending', 'sent', 'parallel-run')`,
        ),
    )
    .addColumn("hold_reason", "text")
    .addColumn("sent_to", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("skipped", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("released_at", "timestamptz")
    .addColumn("sent_at", "timestamptz")
    .addCheckConstraint(
      "coach_monthly_reports_coach_check",
      sql`(kind = 'leader') = (coach_id IS NOT NULL)`,
    )
    .execute();
  await sql`
    CREATE UNIQUE INDEX coach_monthly_reports_one_uidx
    ON coach_monthly_reports (kind, coalesce(coach_id, ''), month)
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_monthly_reports");
  await db.schema.dropTable("coach_monthly_reports").ifExists().execute();
}
