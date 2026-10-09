import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_report_dimension_scores")
    .addColumn("machine_score", "integer", (col) =>
      col.check(sql`machine_score IS NULL OR machine_score BETWEEN 1 AND 5`),
    )
    .execute();
  await db
    .updateTable("coach_report_dimension_scores")
    .set({ machine_score: sql`score` })
    .where("provenance", "=", "machine")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(
    db,
    "coach_report_dimension_scores",
    "provenance = 'human' AND machine_score IS NOT NULL",
  );
  await db.schema
    .alterTable("coach_report_dimension_scores")
    .dropColumn("machine_score")
    .execute();
}
