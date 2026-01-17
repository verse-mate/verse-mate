import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating translation_templates table...");

  await db.schema
    .createTable("translation_templates")
    .addColumn("template_id", "serial", (col) => col.primaryKey())
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    .addColumn("type", "varchar(50)", (col) => col.notNull()) // summary, byline, detailed
    .addColumn("title_template", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("unique_translation_template", [
      "language_code",
      "type",
    ])
    .execute();

  // Index for language_code lookups
  await db.schema
    .createIndex("idx_translation_templates_language")
    .on("translation_templates")
    .column("language_code")
    .execute();

  console.log("Successfully created translation_templates table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping translation_templates table...");
  await db.schema.dropTable("translation_templates").ifExists().execute();
  console.log("Successfully dropped translation_templates table.");
}
