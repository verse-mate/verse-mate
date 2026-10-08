import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_report_amendments")
    .addColumn("report_id", "text", (col) =>
      col.notNull().references("coach_reports.id").onDelete("cascade"),
    )
    .addColumn("revision", "integer", (col) =>
      col.notNull().check(sql`revision >= 1`),
    )
    .addColumn("previous", "jsonb", (col) => col.notNull())
    .addColumn("changes", "jsonb", (col) => col.notNull())
    .addColumn("amended_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("amended_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("sent_to", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("skipped_recipients", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("sent_at", "timestamp")
    .addPrimaryKeyConstraint("coach_report_amendments_pkey", [
      "report_id",
      "revision",
    ])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_report_amendments");
  await db.schema.dropTable("coach_report_amendments").ifExists().execute();
}
