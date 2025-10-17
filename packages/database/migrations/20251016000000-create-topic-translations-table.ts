import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating topic_translations table...");

  await db.schema
    .createTable("topic_translations")
    .addColumn("translation_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("topic_id", "uuid", (col) =>
      col.references("topics.topic_id").onDelete("cascade").notNull(),
    )
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    .addColumn("translated_name", "varchar(255)", (col) => col.notNull())
    .addColumn("translated_description", "text")
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("unique_topic_translation", [
      "topic_id",
      "language_code",
    ])
    .execute();

  // Index for language_code lookups
  await db.schema
    .createIndex("idx_topic_translations_language")
    .on("topic_translations")
    .column("language_code")
    .execute();

  // Index for topic_id lookups
  await db.schema
    .createIndex("idx_topic_translations_topic_id")
    .on("topic_translations")
    .column("topic_id")
    .execute();

  console.log("Successfully created topic_translations table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping topic_translations table...");
  await db.schema.dropTable("topic_translations").ifExists().execute();
  console.log("Successfully dropped topic_translations table.");
}
