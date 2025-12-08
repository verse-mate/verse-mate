import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating book_introductions table...");

  // Create book_introductions table
  await db.schema
    .createTable("book_introductions")
    .addColumn("introduction_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("book_id", "integer", (col) =>
      col.references("books.book_id").onDelete("cascade").notNull(),
    )
    .addColumn("author", "text")
    .addColumn("date_written", "text")
    .addColumn("biblical_role", "text")
    .addColumn("key_themes", sql`text[]`)
    .addColumn("related_books", "text")
    .addColumn("literary_style", "text")
    .addColumn("full_intro_text", "text", (col) => col.notNull())
    .addColumn("language_code", "text", (col) => col.notNull().defaultTo("en"))
    .addColumn("version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_by_admin", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  // Add unique constraint for book_id, language_code, and version combination
  await db.schema
    .createIndex("unique_book_language_version")
    .on("book_introductions")
    .columns(["book_id", "language_code", "version"])
    .unique()
    .execute();

  // Create index for active introductions lookup
  await db.schema
    .createIndex("idx_book_intros_active")
    .on("book_introductions")
    .columns(["book_id", "is_active"])
    .execute();

  // Create index for language code filtering
  await db.schema
    .createIndex("idx_book_intros_language")
    .on("book_introductions")
    .column("language_code")
    .execute();

  console.log("Successfully created book_introductions table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping book_introductions table...");

  // Drop indexes
  await db.schema.dropIndex("idx_book_intros_language").execute();
  await db.schema.dropIndex("idx_book_intros_active").execute();
  await db.schema.dropIndex("unique_book_language_version").execute();

  // Drop table
  await db.schema.dropTable("book_introductions").execute();

  console.log("Successfully dropped book_introductions table.");
}
