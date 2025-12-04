import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("user_sso_accounts")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("provider", sql`sso_provider_enum`, (col) => col.notNull())
    .addColumn("provider_user_id", "varchar(255)", (col) => col.notNull())
    .addColumn("email", "varchar(250)", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  // Add unique constraint on (provider, provider_user_id) to prevent duplicate SSO links
  await db.schema
    .createIndex("user_sso_accounts_provider_provider_user_id_unique")
    .on("user_sso_accounts")
    .columns(["provider", "provider_user_id"])
    .unique()
    .execute();

  // Add index on user_id for efficient lookups
  await db.schema
    .createIndex("user_sso_accounts_user_id_idx")
    .on("user_sso_accounts")
    .column("user_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .dropIndex("user_sso_accounts_user_id_idx")
    .ifExists()
    .execute();
  await db.schema
    .dropIndex("user_sso_accounts_provider_provider_user_id_unique")
    .ifExists()
    .execute();
  await db.schema.dropTable("user_sso_accounts").execute();
}
