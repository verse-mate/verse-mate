import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // 1. Add version_id as a nullable column first
  await db.schema
    .alterTable("explanations")
    .addColumn("version_id", "uuid", (col) =>
      col.references("bible_versions.id").onDelete("cascade"),
    )
    .execute();
  // 2. Backfill the data for existing explanations
  await db
    .updateTable("explanations")
    .set({
      version_id: sql`(SELECT id FROM bible_versions WHERE version_key = 'NASB1995' LIMIT 1)`,
    } as any)
    .execute();
  // 3. Now, alter the column to be NOT NULL
  await db.schema
    .alterTable("explanations")
    .alterColumn("version_id", (col) => col.setNotNull())
    .execute();
  // 4. Update unique constraint to include version
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_explanations_chap_type`.compile(db),
  );
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_explanations_chap_type_version ON explanations(chapter_id, type, version_id)`.compile(
      db,
    ),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop the new constraint
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_explanations_chap_type_version`.compile(db),
  );
  // Restore the original constraint
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_explanations_chap_type ON explanations(chapter_id, type)`.compile(
      db,
    ),
  );
  // Drop the version_id column
  await db.schema.alterTable("explanations").dropColumn("version_id").execute();
}
