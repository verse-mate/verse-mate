import type { Kysely } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_report_amendments")
    .addColumn("sending_at", "timestamp")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_report_amendments", "sending_at IS NOT NULL");
  await db.schema
    .alterTable("coach_report_amendments")
    .dropColumn("sending_at")
    .execute();
}
