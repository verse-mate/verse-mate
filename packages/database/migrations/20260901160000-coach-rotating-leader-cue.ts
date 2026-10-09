import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_intake_sessions")
    .addColumn("leader_cue", "text", (col) =>
      col.check(
        sql`leader_cue IN ('opening_prayer', 'reading', 'application', 'closing_prayer', 'none')`,
      ),
    )
    .addColumn("leader_cue_line", "text")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_intake_sessions", "leader_cue IS NOT NULL");
  await db.schema
    .alterTable("coach_intake_sessions")
    .dropColumn("leader_cue_line")
    .dropColumn("leader_cue")
    .execute();
}
