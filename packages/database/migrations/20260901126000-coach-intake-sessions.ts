import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Migration 8 of 9 (change: port-coach-pipeline, design D13).
 *
 * Per-source-session intake state: what the poll has seen (4.1's processed-id
 * dedupe), who it was attributed to (4.2), and how far a held session has got
 * through retrieval (4.9) including a pending re-share request and its
 * resolution (4.9a). One table, because all of it is state about ONE source
 * session.
 *
 * The poll watermark is derived from this table — `max(observed_at)` less a
 * fixed overlap — rather than stored beside it. A stored cursor and a dedupe
 * set can disagree, and when they do the cursor wins and a session is skipped
 * forever; derived, the two cannot drift. The overlap is what makes a
 * late-arriving transcript still visible, and the dedupe is what stops the
 * overlap producing duplicates.
 *
 * `coach_id` is NULLABLE on purpose: an unattributable session must still
 * INGEST and be flagged, never be dropped, so an admin can add a title keyword
 * and have it resolve.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_intake_sessions ...");
  await db.schema
    .createTable("coach_intake_sessions")
    // The provider's own session id — the natural key intake dedupes on.
    .addColumn("source_session_id", "text", (col) => col.primaryKey())
    // NULL while unattributed. The session is kept, not dropped.
    .addColumn("coach_id", "text")
    .addColumn("matched_by", "text", (col) =>
      col.check(
        sql`matched_by IS NULL OR matched_by IN ('title_match', 'name', 'alt_email', 'unresolved')`,
      ),
    )
    .addColumn("title", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("host_email", "text")
    .addColumn("session_date", "date", (col) => col.notNull())
    .addColumn("duration_minutes", "numeric")
    // The watermark's source: when intake first saw this session.
    .addColumn("observed_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addColumn("state", "text", (col) =>
      col
        .notNull()
        .defaultTo("observed")
        .check(
          sql`state IN ('observed', 'held', 'retrieval_failed', 'retained', 'scored', 'delivered')`,
        ),
    )
    .addColumn("retry_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("reshare_requested_at", "timestamp")
    .addColumn("reshare_resolved_at", "timestamp")
    // Set once the session produces a report; cleared rather than orphaned if
    // that report is deleted, because the session was still genuinely observed.
    .addColumn("report_id", "text", (col) =>
      col.references("coach_reports.id").onDelete("set null"),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  // The watermark scan and 4.7's coverage window both read newest-first.
  await db.schema
    .createIndex("coach_intake_sessions_observed_idx")
    .on("coach_intake_sessions")
    .column("observed_at")
    .execute();
  // 4.7 asks "has this leader been observed inside the window".
  await db.schema
    .createIndex("coach_intake_sessions_coach_date_idx")
    .on("coach_intake_sessions")
    .columns(["coach_id", "session_date"])
    .execute();
  // 8.5a lists sessions awaiting a re-share; a partial index keeps that a scan
  // of the pending ones rather than of every session ever observed.
  await sql`
    CREATE INDEX coach_intake_sessions_pending_reshare_idx
    ON coach_intake_sessions (reshare_requested_at)
    WHERE reshare_requested_at IS NOT NULL AND reshare_resolved_at IS NULL
  `.execute(db);

  console.log("coach_intake_sessions created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("coach_intake_sessions").ifExists().execute();
}
