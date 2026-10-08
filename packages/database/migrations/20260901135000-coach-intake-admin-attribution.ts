import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

const BEFORE = ["title_match", "name", "alt_email", "unresolved"];
const AFTER = [...BEFORE, "admin"];

async function allowMatchedBy(db: Kysely<Database>, values: string[]) {
  await sql`ALTER TABLE coach_intake_sessions DROP CONSTRAINT IF EXISTS coach_intake_sessions_matched_by_check`.execute(
    db,
  );
  await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT coach_intake_sessions_matched_by_check CHECK (matched_by IS NULL OR matched_by IN (${sql.join(values.map((v) => sql.lit(v)))}))`.execute(
    db,
  );
}

export async function up(db: Kysely<Database>): Promise<void> {
  await allowMatchedBy(db, AFTER);
}

export async function down(db: Kysely<Database>): Promise<void> {
  const { rows } = await sql<{
    row: string;
  }>`SELECT source_session_id || ' (leader ' || coalesce(coach_id, 'none') || ')' AS row FROM coach_intake_sessions WHERE matched_by = 'admin' ORDER BY 1`.execute(
    db,
  );
  if (rows.length > 0)
    throw new Error(
      `coach_intake_sessions has ${rows.length} session(s) an admin assigned to a leader: ${rows.map((r) => r.row).join(", ")}. The older code has no admin attribution, and rewriting them would lose who assigned them. Record those assignments, set matched_by on each to the value the older code should see, then rerun the down.`,
    );
  await allowMatchedBy(db, BEFORE);
}
