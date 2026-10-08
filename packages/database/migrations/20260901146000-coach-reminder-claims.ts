import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_reminder_sends")
    .addColumn("claimed_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
  await sql`UPDATE coach_reminder_sends SET claimed_at = sent_at`.execute(db);
  await db.schema
    .alterTable("coach_reminder_sends")
    .alterColumn("sent_at", (col) => col.dropNotNull())
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DELETE FROM coach_reminder_sends WHERE sent_at IS NULL`.execute(db);
  await db.schema
    .alterTable("coach_reminder_sends")
    .alterColumn("sent_at", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("coach_reminder_sends")
    .dropColumn("claimed_at")
    .execute();
}
