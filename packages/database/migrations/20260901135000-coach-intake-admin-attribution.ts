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
  await sql`UPDATE coach_intake_sessions SET matched_by = 'unresolved' WHERE matched_by = 'admin'`.execute(
    db,
  );
  await allowMatchedBy(db, BEFORE);
}
