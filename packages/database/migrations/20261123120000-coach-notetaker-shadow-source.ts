import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * A session can come from the VerseMate notetaker as a shadow.
 *
 * With COACH_NOTETAKER_SHADOW on, intake also records each class the notetaker
 * exported (`source = 'notetaker'`), so its scores can be compared with the
 * Fireflies recording of the same class. Such a session is always a parallel
 * run and is never sent to a leader. Nothing else in the table changes.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await sql`ALTER TABLE coach_intake_sessions DROP CONSTRAINT coach_intake_sessions_source_check`.execute(
    db,
  );
  await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT coach_intake_sessions_source_check CHECK (source IN ('bot', 'upload', 'notetaker'))`.execute(
    db,
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  // The older check cannot hold a notetaker session, so no flag lets this
  // down past one: it would fail on the constraint instead, halfway through.
  const { rows } = await sql<{
    row: string;
  }>`SELECT source_session_id || ' (' || state || ')' AS row FROM coach_intake_sessions WHERE source = 'notetaker' ORDER BY 1`.execute(
    db,
  );
  if (rows.length > 0)
    throw new Error(
      `coach_intake_sessions has ${rows.length} notetaker session(s) the older code cannot hold: ${rows.map((r) => r.row).join(", ")}. They were never sent to anyone: dump them, delete each one with its report and assets, then rerun the down.`,
    );
  await sql`ALTER TABLE coach_intake_sessions DROP CONSTRAINT coach_intake_sessions_source_check`.execute(
    db,
  );
  await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT coach_intake_sessions_source_check CHECK (source IN ('bot', 'upload'))`.execute(
    db,
  );
}
