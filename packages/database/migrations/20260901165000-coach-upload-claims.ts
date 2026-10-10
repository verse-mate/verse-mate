import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_uploads")
    .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("claimed_at", "timestamptz")
    .addColumn("addresses_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(
    db,
    "coach_uploads",
    "attempts > 0 OR claimed_at IS NOT NULL",
  );
  await db.schema
    .alterTable("coach_uploads")
    .dropColumn("addresses_at")
    .dropColumn("claimed_at")
    .dropColumn("attempts")
    .execute();
}
