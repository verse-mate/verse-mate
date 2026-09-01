import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Migration 6 of 9 (change: port-coach-pipeline, design D13).
 *
 * Per-dimension score provenance. The bundle carried dimension scores as prose
 * inside a report's jsonb, with no record of whether a number came from the
 * model or from an admin's correction — so a re-score silently overwrote human
 * judgement and an admin could not see which was which.
 *
 * A row per (report, dimension) rather than a jsonb blob, because task 5.7
 * corrects ONE dimension and task 5.6 requires the correction to survive a
 * re-score: a re-score writes machine rows and leaves human rows standing,
 * which is an UPDATE ... WHERE provenance = 'machine', not a blob rewrite.
 *
 * `score` is nullable on purpose: a dimension that could not be observed is
 * NOT-APPLICABLE, and the scoring model must record that rather than guessing
 * or scoring low (it is also excluded from its cluster's denominator).
 *
 * `model_version` sits per dimension, not per report: after a re-score at a new
 * version a report can legitimately hold machine rows at the new version beside
 * human rows corrected under the old one.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_report_dimension_scores ...");
  await db.schema
    .createTable("coach_report_dimension_scores")
    .addColumn("report_id", "text", (col) =>
      col.notNull().references("coach_reports.id").onDelete("cascade"),
    )
    .addColumn("dimension_n", "integer", (col) =>
      col.notNull().check(sql`dimension_n BETWEEN 1 AND 12`),
    )
    // NULL = not applicable this session. Never a low score.
    .addColumn("score", "integer", (col) =>
      col.check(sql`score IS NULL OR score BETWEEN 1 AND 5`),
    )
    .addColumn("rationale", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("provenance", "text", (col) =>
      col.notNull().check(sql`provenance IN ('machine', 'human')`),
    )
    .addColumn("model_version", "text")
    .addColumn("corrected_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addPrimaryKeyConstraint("coach_report_dimension_scores_pkey", [
      "report_id",
      "dimension_n",
    ])
    .execute();
  console.log("coach_report_dimension_scores created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .dropTable("coach_report_dimension_scores")
    .ifExists()
    .execute();
}
