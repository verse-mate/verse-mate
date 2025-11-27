import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "Adding default_relevance_threshold column to highlight_themes...",
  );

  // Add default_relevance_threshold column to highlight_themes
  await db.schema
    .alterTable("highlight_themes")
    .addColumn("default_relevance_threshold", "integer", (col) =>
      col.defaultTo(3).notNull(),
    )
    .execute();

  // Add constraint to ensure valid range
  await db.executeQuery(
    sql`ALTER TABLE highlight_themes ADD CONSTRAINT check_default_relevance_range CHECK (default_relevance_threshold >= 1 AND default_relevance_threshold <= 5)`.compile(
      db,
    ),
  );

  console.log(
    "Successfully added default_relevance_threshold column to highlight_themes.",
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log(
    "Removing default_relevance_threshold column from highlight_themes...",
  );

  // Drop constraint first
  await db.executeQuery(
    sql`ALTER TABLE highlight_themes DROP CONSTRAINT IF EXISTS check_default_relevance_range`.compile(
      db,
    ),
  );

  // Drop column
  await db.schema
    .alterTable("highlight_themes")
    .dropColumn("default_relevance_threshold")
    .execute();

  console.log(
    "Successfully removed default_relevance_threshold column from highlight_themes.",
  );
}
