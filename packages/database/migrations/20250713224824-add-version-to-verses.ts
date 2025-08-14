import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Add version_id column to verses table
  await db.schema
    .alterTable("verses")
    .addColumn("version_id", "uuid", (col) =>
      col.references("bible_versions.id").onDelete("cascade"),
    )
    .execute();

  // Set default version for existing verses
  await db
    .updateTable("verses")
    .set({
      version_id: db
        .selectFrom("bible_versions")
        .select("id")
        .where("version_key", "=", "NASB1995")
        .limit(1),
    })
    .execute();

  await db.schema
    .alterTable("verses")
    .alterColumn("version_id", (col) => col.setNotNull())
    .execute();

  // Create index for performance
  await db.executeQuery(
    sql`CREATE INDEX IF NOT EXISTS idx_verses_version ON verses(version_id)`.compile(
      db,
    ),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_verses_version`.compile(db),
  );
  await db.schema.alterTable("verses").dropColumn("version_id").execute();
}
