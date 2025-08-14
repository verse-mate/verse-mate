import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Drop existing verse constraint
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_verses_chap_verse`.compile(db),
  );

  // Create new constraint that includes version_id
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_verses_chap_verse_version ON verses(chapter_id, verse_number, version_id)`.compile(
      db,
    ),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_verses_chap_verse_version`.compile(db),
  );

  // Restore original constraint
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_verses_chap_verse ON verses(chapter_id, verse_number)`.compile(
      db,
    ),
  );
}
