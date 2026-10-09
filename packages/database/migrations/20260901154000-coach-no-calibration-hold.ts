import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

const KINDS = [
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
  await db
    .updateTable("coach_intake_sessions")
    .set({ hold_kind: null, hold_reason: null })
    .where("hold_kind", "=", "calibration")
    .execute();
  await allow(db, KINDS);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await allow(db, [...KINDS.slice(0, 2), "calibration", ...KINDS.slice(2)]);
}
