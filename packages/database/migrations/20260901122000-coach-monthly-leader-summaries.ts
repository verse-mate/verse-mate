import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Migration 4 of 9 (change: port-coach-pipeline, design D13).
 *
 * Per-leader monthly summaries move out of the bundle's
 * `monthlyLeaderSummaries` map (leader slug → month → summary).
 *
 * Keyed on (coach_id, month): one summary per leader per month, so a
 * re-publish updates in place while a leader's other months are untouched.
 * `coach_id` is the roster slug, the same key `coach_reports` uses, so the
 * two join without a translation table.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_monthly_leader_summaries ...");
  await db.schema
    .createTable("coach_monthly_leader_summaries")
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("month", "text", (col) => col.notNull())
    .addColumn("summary", "jsonb", (col) => col.notNull())
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addPrimaryKeyConstraint("coach_monthly_leader_summaries_pkey", [
      "coach_id",
      "month",
    ])
    .execute();
  await db.schema
    .createIndex("coach_monthly_leader_summaries_month_idx")
    .on("coach_monthly_leader_summaries")
    .column("month")
    .execute();
  console.log("coach_monthly_leader_summaries created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .dropTable("coach_monthly_leader_summaries")
    .ifExists()
    .execute();
}
