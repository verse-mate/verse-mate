import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS "idx_explanations_chap_type_version"`.compile(db),
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX idx_explanations_chap_type_version ON explanations(chapter_id, type, version_id)`.compile(
      db,
    ),
  );
}
