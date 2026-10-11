import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await db.schema
    .alterTable("support_messages")
    .addColumn("slack_ts", "varchar(50)")
    .execute();
  await db.schema
    .createIndex("uq_support_messages_conversation_slack_ts")
    .on("support_messages")
    .columns(["conversation_id", "slack_ts"])
    .unique()
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await db.schema
    .dropIndex("uq_support_messages_conversation_slack_ts")
    .ifExists()
    .execute();
  await db.schema
    .alterTable("support_messages")
    .dropColumn("slack_ts")
    .execute();
}
