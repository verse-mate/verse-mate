import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_leader_email_changes")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("previous_email", "text", (col) => col.notNull())
    .addColumn("new_email", "text", (col) => col.notNull())
    .addColumn("changed_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("changed_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
  await db.schema
    .createIndex("coach_leader_email_changes_slug_idx")
    .on("coach_leader_email_changes")
    .columns(["slug", "changed_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("coach_leader_email_changes").ifExists().execute();
}
