import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Add book_id and chapter_number columns to verse_highlights table
  await db.schema
    .alterTable("verse_highlights")
    .addColumn("book_id", "integer")
    .execute();

  await db.schema
    .alterTable("verse_highlights")
    .addColumn("chapter_number", "integer")
    .execute();

  // Backfill book_id and chapter_number from chapters table using chapter_id foreign key
  await sql`
    UPDATE verse_highlights vh
    SET book_id = c.book_id,
        chapter_number = c.chapter_number
    FROM chapters c
    WHERE vh.chapter_id = c.chapter_id
  `.execute(db);

  // Add NOT NULL constraints after backfill
  await db.schema
    .alterTable("verse_highlights")
    .alterColumn("book_id", (col) => col.setNotNull())
    .execute();

  await db.schema
    .alterTable("verse_highlights")
    .alterColumn("chapter_number", (col) => col.setNotNull())
    .execute();

  // Add index for efficient querying by book_id and chapter_number
  await db.schema
    .createIndex("idx_verse_highlights_book_chapter")
    .on("verse_highlights")
    .columns(["book_id", "chapter_number"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop index
  await db.schema.dropIndex("idx_verse_highlights_book_chapter").execute();

  // Drop columns
  await db.schema
    .alterTable("verse_highlights")
    .dropColumn("book_id")
    .execute();

  await db.schema
    .alterTable("verse_highlights")
    .dropColumn("chapter_number")
    .execute();
}
