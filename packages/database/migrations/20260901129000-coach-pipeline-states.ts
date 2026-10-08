import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

const BEFORE = [
  "observed",
  "held",
  "retrieval_failed",
  "retained",
  "scored",
  "delivered",
];

const AFTER = [
  ...BEFORE,
  "scoring_failed",
  "delivery_pending",
  "delivering",
  "delivery_failed",
];

async function allowStates(db: Kysely<Database>, states: string[]) {
  await sql`ALTER TABLE coach_intake_sessions DROP CONSTRAINT IF EXISTS coach_intake_sessions_state_check`.execute(
    db,
  );
  await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT coach_intake_sessions_state_check CHECK (state IN (${sql.join(states.map((s) => sql.lit(s)))}))`.execute(
    db,
  );
}

export async function up(db: Kysely<Database>): Promise<void> {
  await allowStates(db, AFTER);
  await sql`
    CREATE UNIQUE INDEX coach_intake_sessions_one_delivery_per_leader_uidx
    ON coach_intake_sessions (coach_id)
    WHERE state = 'delivering'
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS coach_intake_sessions_one_delivery_per_leader_uidx`.execute(
    db,
  );
  const { rows } = await sql<{
    row: string;
  }>`SELECT source_session_id || ' (' || state || ')' AS row FROM coach_intake_sessions WHERE state IN ('scoring_failed', 'delivery_pending', 'delivering', 'delivery_failed') ORDER BY 1`.execute(
    db,
  );
  if (rows.length > 0)
    throw new Error(
      `coach_intake_sessions has ${rows.length} session(s) in a state the older code cannot hold: ${rows.map((r) => r.row).join(", ")}. Turning them back into scored or retained would make an in-flight or failed delivery claimable again and could mail its recipients twice. Let each delivery finish on the current code, and settle each failed one by hand (record whether its recipients got the report, then move it to delivered or delete it), then rerun the down.`,
    );
  await allowStates(db, BEFORE);
}
