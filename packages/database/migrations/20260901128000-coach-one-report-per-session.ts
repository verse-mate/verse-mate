import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Migration 10 of 10 (change: port-coach-pipeline, task 6.2a).
 *
 * ONE report per source session, enforced by the database.
 *
 * The store's unique key is (coach_id, session_date, source_session_id), which
 * says "one report per leader per session" and leaves the leader free. Change
 * the attribution of a session (an admin fixing a wrong match, or a keyword
 * rule that resolves differently after a roster edit) and the next publish
 * finds no row for the new leader, inserts a second report for the same
 * session, and leaves the first standing under the wrong leader. Two reports,
 * two emails, and a corpus that double-counts one session in both leaders'
 * trends.
 *
 * The session id is the identity of the session, so it is unique on its own.
 * Backfilled rows carry a sentinel that already embeds the leader and date, so
 * they satisfy this too.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Enforcing one report per source session ...");
  await sql`
    CREATE UNIQUE INDEX coach_reports_source_session_uidx
    ON coach_reports (source_session_id)
  `.execute(db);
  console.log("coach_reports_source_session_uidx created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS coach_reports_source_session_uidx`.execute(db);
}
