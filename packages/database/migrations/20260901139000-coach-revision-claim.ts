import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_report_amendments")
    .addColumn("sending_at", "timestamp")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_report_amendments")
    .dropColumn("sending_at")
    .execute();
}
