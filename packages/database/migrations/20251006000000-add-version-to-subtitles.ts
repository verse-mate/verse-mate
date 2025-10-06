import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding version_id column to subtitles table");

  // 1. Add version_id column to subtitles table (nullable initially)
  await db.schema
    .alterTable("subtitles")
    .addColumn("version_id", "uuid", (col) =>
      col.references("bible_versions.id").onDelete("cascade"),
    )
    .execute();

  // 2. Set default version for existing subtitles
  console.log("Setting default version for existing subtitles");
  // Using raw SQL since type definitions don't include version_id yet
  await db.executeQuery(
    sql`UPDATE subtitles SET version_id = (SELECT id FROM bible_versions WHERE version_key = 'NASB1995' LIMIT 1)`.compile(
      db,
    ),
  );

  // 3. Make version_id NOT NULL
  console.log("Making version_id column NOT NULL");
  await db.schema
    .alterTable("subtitles")
    .alterColumn("version_id", (col) => col.setNotNull())
    .execute();

  // 4. Update unique constraint to include version_id
  console.log("Updating unique constraint to include version_id");
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_subtitles_chap_range`.compile(db),
  );

  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_subtitles_chap_range_version ON subtitles(chapter_id, start_verse, end_verse, version_id)`.compile(
      db,
    ),
  );

  // 5. Create index for performance
  await db.executeQuery(
    sql`CREATE INDEX IF NOT EXISTS idx_subtitles_version ON subtitles(version_id)`.compile(
      db,
    ),
  );

  console.log("Successfully added version support to subtitles table");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Removing version support from subtitles table");

  // Drop indexes first
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_subtitles_version`.compile(db),
  );

  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_subtitles_chap_range_version`.compile(db),
  );

  // Restore the original constraint
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_subtitles_chap_range ON subtitles(chapter_id, start_verse, end_verse)`.compile(
      db,
    ),
  );

  // Drop the version_id column
  await db.schema.alterTable("subtitles").dropColumn("version_id").execute();

  console.log("Successfully removed version support from subtitles table");
}
