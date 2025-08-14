import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("bible_versions")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("version_key", "varchar(20)", (col) => col.notNull().unique())
    .addColumn("version_name", "varchar(100)", (col) => col.notNull())
    .addColumn("language_code", "varchar(5)", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) => col.defaultTo(sql`now()`))
    .execute();

  // Insert default version
  await db
    .insertInto("bible_versions")
    .values({
      version_key: "NASB1995",
      version_name: "New American Standard Bible 1995",
      language_code: "en",
      is_active: true,
    })
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("bible_versions").execute();
}
