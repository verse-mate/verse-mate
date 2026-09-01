import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Migration 9 of 9 (change: port-coach-pipeline, design D13, task 6.2).
 *
 * The structured evidence governance rule 2 queries: the quotes and timestamps
 * a report cites. A COLUMN, not prose, so the reuse check never parses a
 * report body — parsing prose to enforce a rule about prose is how a governance
 * check becomes unreliable in exactly the cases that matter.
 *
 * NULLABLE, and that is the whole design of the comparison set. A NULL means
 * "this report predates the evidence field", which is true of every backfilled
 * report: none carries a quote field at any snapshot, and only a minority carry
 * a structured timestamp. Seeding the set from what happens to exist would
 * enforce rule 2 unevenly — hard on the leaders whose old reports happen to
 * have timestamps, not at all on the rest. So it starts EMPTY for everyone, and
 * the accepted residual is stated: reuse of material that appears only in
 * pre-cutover reports is not detected.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding coach_reports.evidence ...");
  await db.schema
    .alterTable("coach_reports")
    .addColumn("evidence", "jsonb")
    .execute();

  // Rule 2 asks "has this leader used this quote before", so the lookup is by
  // leader and the evidence is the payload.
  await sql`
    CREATE INDEX coach_reports_evidence_idx
    ON coach_reports (coach_id)
    WHERE evidence IS NOT NULL
  `.execute(db);

  console.log("coach_reports.evidence added successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS coach_reports_evidence_idx`.execute(db);
  await db.schema.alterTable("coach_reports").dropColumn("evidence").execute();
}
