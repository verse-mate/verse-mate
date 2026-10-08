import type { Kysely } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_calibration_runs")
    .addColumn("per_leader", "jsonb")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_calibration_runs", "per_leader IS NOT NULL");
  await db.schema
    .alterTable("coach_calibration_runs")
    .dropColumn("per_leader")
    .execute();
}
