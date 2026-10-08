import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_reminder_summaries")
    .addColumn("reminder_date", "date", (col) => col.primaryKey())
    .addColumn("sent_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_reminder_summaries");
  await db.schema.dropTable("coach_reminder_summaries").ifExists().execute();
}
