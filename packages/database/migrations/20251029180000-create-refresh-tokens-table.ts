import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("refresh_tokens")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("token", "varchar(500)", (col) => col.notNull().unique())
    .addColumn("user_agent", "varchar(500)")
    .addColumn("ip_address", "varchar(45)")
    .addColumn("expires_at", "timestamp", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn("last_used_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  // Index for faster lookups by user_id
  await db.schema
    .createIndex("idx_refresh_tokens_user_id")
    .on("refresh_tokens")
    .column("user_id")
    .execute();

  // Index for faster lookups by token
  await db.schema
    .createIndex("idx_refresh_tokens_token")
    .on("refresh_tokens")
    .column("token")
    .execute();

  // Index for cleanup of expired tokens
  await db.schema
    .createIndex("idx_refresh_tokens_expires_at")
    .on("refresh_tokens")
    .column("expires_at")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("refresh_tokens").execute();
}
