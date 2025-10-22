import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating notes table...");

  // Create notes table
  await db.schema
    .createTable("notes")
    .addColumn("note_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("chapter_id", "integer", (col) =>
      col.references("chapters.chapter_id").onDelete("cascade").notNull(),
    )
    .addColumn("verse_id", "integer", (col) =>
      col.references("verses.verse_id").onDelete("cascade"),
    )
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  // Create indexes for performance
  await db.schema
    .createIndex("idx_notes_user_id")
    .on("notes")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("idx_notes_chapter_id")
    .on("notes")
    .column("chapter_id")
    .execute();

  await db.schema
    .createIndex("idx_notes_verse_id")
    .on("notes")
    .column("verse_id")
    .execute();

  // Composite index for efficient querying by user and chapter
  await db.schema
    .createIndex("idx_notes_user_chapter")
    .on("notes")
    .columns(["user_id", "chapter_id"])
    .execute();

  // Add index for timestamp-based queries (cleanup, user activity)
  await db.schema
    .createIndex("idx_notes_created_at")
    .on("notes")
    .column("created_at")
    .execute();

  // Add constraint to ensure content is not empty
  await db.schema
    .alterTable("notes")
    .addCheckConstraint(
      "check_content_not_empty",
      sql`length(trim(content)) > 0`,
    )
    .execute();

  console.log("Successfully created notes table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping notes table...");

  // Drop constraint
  await db.schema
    .alterTable("notes")
    .dropConstraint("check_content_not_empty")
    .execute();

  // Drop indexes
  await db.schema.dropIndex("idx_notes_created_at").execute();
  await db.schema.dropIndex("idx_notes_user_chapter").execute();
  await db.schema.dropIndex("idx_notes_verse_id").execute();
  await db.schema.dropIndex("idx_notes_chapter_id").execute();
  await db.schema.dropIndex("idx_notes_user_id").execute();

  // Drop table
  await db.schema.dropTable("notes").execute();

  console.log("Successfully dropped notes table.");
}
