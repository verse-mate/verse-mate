import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_report_amendments")
    .addColumn("coach_id", "text")
    .execute();
  await sql`
    UPDATE coach_report_amendments a
    SET coach_id = r.coach_id
    FROM coach_reports r
    WHERE r.id = a.report_id
  `.execute(db);
  await db.schema
    .alterTable("coach_report_amendments")
    .alterColumn("coach_id", (col) => col.setNotNull())
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_report_amendments")
    .dropColumn("coach_id")
    .execute();
}
