import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Drop the old, incorrect unique index if it exists
  await db.schema
    .dropIndex("unique_topic_explanations_constraint")
    .ifExists()
    .execute();

  // Create a new partial unique index that only applies to active topic explanations
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_active_topic_explanation_idx ON topic_explanations (topic_id, language_code, type) WHERE is_active = true`.compile(
      db,
    ),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop the new partial unique index
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_active_topic_explanation_idx`.compile(db),
  );

  // Re-create the old unique index
  await db.schema
    .createIndex("unique_topic_explanations_constraint")
    .on("topic_explanations")
    .columns(["topic_id", "language_code", "type"])
    .unique()
    .execute();
}
