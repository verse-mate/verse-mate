import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Create highlight color enum
  await db.schema
    .createType("highlight_color_enum")
    .asEnum(["yellow", "green", "blue", "pink", "purple", "orange"])
    .execute();

  // Create verse_highlights table
  await db.schema
    .createTable("verse_highlights")
    .addColumn("highlight_id", "serial", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("chapter_id", "integer", (col) =>
      col.references("chapters.chapter_id").onDelete("cascade").notNull(),
    )
    .addColumn("start_verse", "integer", (col) => col.notNull())
    .addColumn("end_verse", "integer", (col) => col.notNull())
    .addColumn("color", sql`highlight_color_enum`, (col) =>
      col.notNull().defaultTo("yellow"),
    )
    .addColumn("start_char", "integer", (col) => col)
    .addColumn("end_char", "integer", (col) => col)
    .addColumn("selected_text", "text", (col) => col)
    .addColumn("created_at", "timestamp", (col) => col.defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamp", (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create composite index for efficient querying
  await db.schema
    .createIndex("idx_verse_highlights_user_chapter")
    .on("verse_highlights")
    .columns(["user_id", "chapter_id", "start_verse", "end_verse"])
    .execute();

  // Add additional performance indexes
  await db.schema
    .createIndex("idx_verse_highlights_user_id")
    .on("verse_highlights")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("idx_verse_highlights_chapter_id")
    .on("verse_highlights")
    .column("chapter_id")
    .execute();

  // Add index for timestamp-based queries (cleanup, user activity)
  await db.schema
    .createIndex("idx_verse_highlights_created_at")
    .on("verse_highlights")
    .column("created_at")
    .execute();

  // Add index on created_at for efficient cleanup queries
  await db.schema
    .createIndex("idx_verse_highlights_user_created")
    .on("verse_highlights")
    .columns(["user_id", "created_at"])
    .execute();

  // Add constraint to ensure valid verse ranges
  await db.schema
    .alterTable("verse_highlights")
    .addCheckConstraint(
      "check_valid_verse_range",
      sql`start_verse <= end_verse`,
    )
    .execute();

  // Add constraint to ensure verse numbers are positive
  await db.schema
    .alterTable("verse_highlights")
    .addCheckConstraint(
      "check_positive_verses",
      sql`start_verse > 0 AND end_verse > 0`,
    )
    .execute();

  // Add constraint to ensure valid character ranges when both are present
  await db.schema
    .alterTable("verse_highlights")
    .addCheckConstraint(
      "check_valid_char_range",
      sql`(start_char IS NULL AND end_char IS NULL) OR (start_char IS NOT NULL AND end_char IS NOT NULL AND start_char <= end_char)`,
    )
    .execute();

  // Add constraint to ensure character positions are non-negative when present
  await db.schema
    .alterTable("verse_highlights")
    .addCheckConstraint(
      "check_non_negative_chars",
      sql`(start_char IS NULL OR start_char >= 0) AND (end_char IS NULL OR end_char >= 0)`,
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop constraints
  await db.schema
    .alterTable("verse_highlights")
    .dropConstraint("check_non_negative_chars")
    .execute();

  await db.schema
    .alterTable("verse_highlights")
    .dropConstraint("check_valid_char_range")
    .execute();

  await db.schema
    .alterTable("verse_highlights")
    .dropConstraint("check_positive_verses")
    .execute();

  await db.schema
    .alterTable("verse_highlights")
    .dropConstraint("check_valid_verse_range")
    .execute();

  // Drop indexes
  await db.schema.dropIndex("idx_verse_highlights_user_created").execute();
  await db.schema.dropIndex("idx_verse_highlights_created_at").execute();
  await db.schema.dropIndex("idx_verse_highlights_chapter_id").execute();
  await db.schema.dropIndex("idx_verse_highlights_user_id").execute();
  await db.schema.dropIndex("idx_verse_highlights_user_chapter").execute();

  // Drop table and enum
  await db.schema.dropTable("verse_highlights").execute();
  await db.schema.dropType("highlight_color_enum").execute();
}
