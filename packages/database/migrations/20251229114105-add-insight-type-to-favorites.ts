import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Add insight_type column to favorites table
  // NULL = chapter text bookmark (existing behavior)
  // NOT NULL = specific insight tab bookmark (summary, byline, detailed)
  await db.schema
    .alterTable("favorites")
    .addColumn("insight_type", "varchar(20)")
    .execute();

  // Add CHECK constraint to ensure only valid insight types
  await sql`
    ALTER TABLE favorites
    ADD CONSTRAINT insight_type_check
    CHECK (insight_type IN ('summary', 'byline', 'detailed') OR insight_type IS NULL)
  `.execute(db);

  // Add index for efficient querying by user_id, chapter_id, and insight_type
  await db.schema
    .createIndex("idx_favorites_insight_lookup")
    .on("favorites")
    .columns(["user_id", "chapter_id", "insight_type"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop index
  await db.schema.dropIndex("idx_favorites_insight_lookup").execute();

  // Drop CHECK constraint
  await sql`
    ALTER TABLE favorites
    DROP CONSTRAINT IF EXISTS insight_type_check
  `.execute(db);

  // Drop column
  await db.schema.alterTable("favorites").dropColumn("insight_type").execute();
}
