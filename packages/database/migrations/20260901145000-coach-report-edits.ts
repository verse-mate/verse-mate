import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_report_edits")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("report_id", "text", (col) =>
      col.notNull().references("coach_reports.id").onDelete("cascade"),
    )
    .addColumn("changes", "jsonb", (col) => col.notNull())
    .addColumn("edited_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("edited_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
  await db.schema
    .createIndex("coach_report_edits_report_idx")
    .on("coach_report_edits")
    .column("report_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_report_edits");
  await db.schema.dropTable("coach_report_edits").ifExists().execute();
}
