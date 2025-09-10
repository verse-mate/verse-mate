import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Correctly drop the unique index using the correct Kysely syntax
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS "idx_explanations_chap_type_version_active"`.compile(
      db,
    ),
  );

  // Add the new unique constraint that includes the "version" column
  await db.schema
    .alterTable("explanations")
    .addUniqueConstraint("idx_explanations_chap_type_version_version_active", [
      "chapter_id",
      "type",
      "version_id",
      "version",
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop the new unique constraint
  await db.schema
    .alterTable("explanations")
    .dropConstraint("idx_explanations_chap_type_version_version_active")
    .execute();

  // Recreate the previous unique index
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX idx_explanations_chap_type_version_active ON explanations(chapter_id, type, version_id) WHERE is_active = true`.compile(
      db,
    ),
  );
}
