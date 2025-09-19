import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("explanation_languages")
    .addColumn("language_code", "varchar(10)", (col) => col.primaryKey())
    .addColumn("name", "varchar(100)", (col) => col.notNull())
    .addColumn("native_name", "varchar(100)", (col) => col.notNull())
    .addColumn("explanation_count", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("user_preference_count", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("is_enabled", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("is_default", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Add a unique constraint to ensure only one language can be the default
  await db.schema
    .createIndex("explanation_languages_is_default_unique")
    .on("explanation_languages")
    .column("is_default")
    .where("is_default", "=", true)
    .unique()
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("explanation_languages").ifExists().execute();
}
