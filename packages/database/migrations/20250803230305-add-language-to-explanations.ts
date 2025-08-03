import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Add version_id to explanations table
  await db.schema
    .alterTable("explanations")
    .addColumn("version_id", "uuid", (col) =>
      col.references("bible_versions.id").onDelete("cascade").notNull(),
    )
    .execute();

  // Set default version for existing explanations
  await db
    .updateTable("explanations")
    .set({
      version_id: db
        .selectFrom("bible_versions")
        .select("id")
        .where("version_key", "=", "NASB1995")
        .limit(1),
    })
    .execute();

  // Update unique constraint to include version
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_explanations_chap_type`.compile(db),
  );

  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_explanations_chap_type_version ON explanations(chapter_id, type, version_id)`.compile(
      db,
    ),
  );
}
