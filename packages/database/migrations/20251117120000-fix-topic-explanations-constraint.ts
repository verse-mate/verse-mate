import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Drop the existing partial unique index
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_active_topic_explanation_idx`.compile(db),
  );

  // Create a new full unique constraint
  await db.schema
    .createIndex("topic_explanations_topic_id_language_code_type_key")
    .on("topic_explanations")
    .columns(["topic_id", "language_code", "type"])
    .unique()
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop the new full unique constraint
  await db.schema
    .dropIndex("topic_explanations_topic_id_language_code_type_key")
    .ifExists()
    .execute();

  // Re-create the old partial unique index
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_active_topic_explanation_idx ON topic_explanations (topic_id, language_code, type) WHERE is_active = true`.compile(
      db,
    ),
  );
}
