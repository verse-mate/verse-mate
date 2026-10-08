import type { Kysely } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_intake_sessions")
    .addColumn("send_unconfirmed", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_intake_sessions", "send_unconfirmed");
  await db.schema
    .alterTable("coach_intake_sessions")
    .dropColumn("send_unconfirmed")
    .execute();
}
