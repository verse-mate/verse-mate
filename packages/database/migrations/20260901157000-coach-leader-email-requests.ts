import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_leader_email_requests")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("new_email", "text", (col) => col.notNull())
    .addColumn("requested_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("status", "text", (col) =>
      col
        .notNull()
        .defaultTo("pending")
        .check(
          sql`status IN ('pending', 'confirmed', 'superseded', 'refused')`,
        ),
    )
    .addColumn("refusal", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("resolved_at", "timestamptz")
    .execute();
  await db.schema
    .createIndex("coach_leader_email_requests_slug_idx")
    .on("coach_leader_email_requests")
    .columns(["slug", "id"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_leader_email_requests");
  await db.schema.dropTable("coach_leader_email_requests").ifExists().execute();
}
