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
  const { rows } = await sql<{
    row: string;
  }>`SELECT coach_id || ' ' || reminder_date || ' to ' || email AS row FROM coach_reminder_sends WHERE sent_at IS NULL ORDER BY 1`.execute(
    db,
  );
  if (rows.length > 0)
    throw new Error(
      `coach_reminder_sends has ${rows.length} reminder claim(s) with no confirmed send: ${rows.map((r) => r.row).join(", ")}. Deleting them would let the older code send those reminders again. Check with the mail provider whether each went out, set sent_at on the ones that did and delete the ones that did not, then rerun the down.`,
    );
  await db.schema
    .alterTable("coach_reminder_sends")
    .alterColumn("sent_at", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("coach_reminder_sends")
    .dropColumn("claimed_at")
    .execute();
}
