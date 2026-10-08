import type { Kysely } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_intake_sessions")
    .addColumn("hold_reason", "text")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_intake_sessions", "hold_reason IS NOT NULL");
  await db.schema
    .alterTable("coach_intake_sessions")
    .dropColumn("hold_reason")
    .execute();
}
