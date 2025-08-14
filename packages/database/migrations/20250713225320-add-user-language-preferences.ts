import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("user")
    .addColumn("preferred_language", "varchar(5)", (col) => col.defaultTo("en"))
    .addColumn("preferred_bible_version", "varchar(20)", (col) =>
      col.defaultTo("NASB1995").references("bible_versions.version_key"),
    )
    .execute();

  // Create index for language lookups
  await db.executeQuery(
    sql`CREATE INDEX IF NOT EXISTS idx_user_language ON "user"(preferred_language)`.compile(
      db,
    ),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_user_language`.compile(db),
  );
  await db.schema
    .alterTable("user")
    .dropColumn("preferred_bible_version")
    .dropColumn("preferred_language")
    .execute();
}
