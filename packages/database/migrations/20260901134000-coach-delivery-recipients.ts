import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_intake_sessions")
    .addColumn("delivered_to", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_intake_sessions", "delivered_to <> '{}'");
  await db.schema
    .alterTable("coach_intake_sessions")
    .dropColumn("delivered_to")
    .execute();
}
