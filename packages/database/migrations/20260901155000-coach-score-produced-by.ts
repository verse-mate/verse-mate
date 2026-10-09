import type { Kysely } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_report_dimension_scores")
    .addColumn("language_model", "text")
    .addColumn("prompt_version", "text")
    .addColumn("generation_settings", "jsonb")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(
    db,
    "coach_report_dimension_scores",
    "language_model IS NOT NULL OR prompt_version IS NOT NULL OR generation_settings IS NOT NULL",
  );
  await db.schema
    .alterTable("coach_report_dimension_scores")
    .dropColumn("language_model")
    .dropColumn("prompt_version")
    .dropColumn("generation_settings")
    .execute();
}
