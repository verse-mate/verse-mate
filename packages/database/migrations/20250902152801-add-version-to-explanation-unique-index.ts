import type { Kysely } from "kysely";
import { sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Drop the old unique index
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_explanations_chap_type_active`.compile(db),
  );

  // Create a new unique index that includes version_id
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX idx_explanations_chap_type_version_active ON explanations(chapter_id, type, version_id) WHERE is_active = true`.compile(
      db,
    ),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop the new unique index
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_explanations_chap_type_version_active`.compile(
      db,
    ),
  );

  // Recreate the old unique index
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX idx_explanations_chap_type_active ON explanations(chapter_id, type) WHERE is_active = true`.compile(
      db,
    ),
  );
}
