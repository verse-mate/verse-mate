import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

const KEPT = [
  "review",
  "reattributed",
  "governance",
  "cold-recall",
  "no-mailer",
  "send-failed",
];

async function allow(db: Kysely<Database>, kinds: string[]): Promise<void> {
  await sql`ALTER TABLE coach_intake_sessions DROP CONSTRAINT coach_intake_sessions_hold_kind_check`.execute(
    db,
  );
  await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT coach_intake_sessions_hold_kind_check CHECK (hold_kind IS NULL OR hold_kind IN (${sql.join(kinds.map((k) => sql.lit(k)))}))`.execute(
    db,
  );
}

export async function up(db: Kysely<Database>): Promise<void> {
  await allow(db, [...KEPT, "calibration", "scoring-version"]);
  await db
    .updateTable("coach_intake_sessions")
    .set({ hold_kind: null, hold_reason: null })
    .where("hold_kind", "=", "calibration")
    .execute();
  await allow(db, [...KEPT, "scoring-version"]);
}

export async function down(db: Kysely<Database>): Promise<void> {
  const { rows } = await sql<{
    row: string;
  }>`SELECT source_session_id || ' (leader ' || coalesce(coach_id, 'none') || ')' AS row FROM coach_intake_sessions WHERE hold_kind = 'scoring-version' ORDER BY 1`.execute(
    db,
  );
  if (rows.length > 0)
    throw new Error(
      `coach_intake_sessions has ${rows.length} session(s) held for their scoring version: ${rows.map((r) => r.row).join(", ")}. The older code has no such hold, and dropping it would let them be delivered unreviewed. Release or delete each on the current code, then rerun the down.`,
    );
  await allow(db, [...KEPT.slice(0, 2), "calibration", ...KEPT.slice(2)]);
}
