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
  await sql`UPDATE coach_intake_sessions SET state = 'retained' WHERE state = 'scoring_failed'`.execute(
    db,
  );
  await sql`UPDATE coach_intake_sessions SET state = 'scored' WHERE state IN ('delivery_pending', 'delivering', 'delivery_failed')`.execute(
    db,
  );
  await allowStates(db, BEFORE);
}
