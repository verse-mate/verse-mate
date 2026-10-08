import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_reminder_sends")
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("reminder_date", "date", (col) => col.notNull())
    .addColumn("report_id", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("sent_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("coach_reminder_sends_pkey", [
      "coach_id",
      "reminder_date",
    ])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_reminder_sends");
  await db.schema.dropTable("coach_reminder_sends").ifExists().execute();
}
