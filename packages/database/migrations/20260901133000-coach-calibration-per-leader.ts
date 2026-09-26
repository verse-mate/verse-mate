import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_calibration_runs")
    .addColumn("per_leader", "jsonb")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_calibration_runs")
    .dropColumn("per_leader")
    .execute();
}
