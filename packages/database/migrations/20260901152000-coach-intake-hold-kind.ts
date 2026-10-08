import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

const KINDS = [
  "review",
  "reattributed",
  "calibration",
  "governance",
  "cold-recall",
  "no-mailer",
  "send-failed",
];

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_intake_sessions")
    .addColumn("hold_kind", "text")
    .execute();
  await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT coach_intake_sessions_hold_kind_check CHECK (hold_kind IS NULL OR hold_kind IN (${sql.join(KINDS.map((k) => sql.lit(k)))}))`.execute(
    db,
  );
  await sql`
    UPDATE coach_intake_sessions SET hold_kind = CASE
      WHEN hold_reason LIKE 'held for review%' THEN 'review'
      WHEN hold_reason LIKE 're-attributed%' THEN 'reattributed'
      WHEN hold_reason LIKE 'held for calibration%' THEN 'calibration'
      WHEN hold_reason LIKE 'held by governance%' THEN 'governance'
      WHEN hold_reason LIKE 'held: a first lesson%' THEN 'cold-recall'
      WHEN hold_reason LIKE 'held until delivered%' THEN 'no-mailer'
      ELSE 'send-failed'
    END
    WHERE hold_reason IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_intake_sessions", "hold_kind IS NOT NULL");
  await db.schema
    .alterTable("coach_intake_sessions")
    .dropColumn("hold_kind")
    .execute();
}
