import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createIndex("unique_topic_explanations_constraint")
    .on("topic_explanations")
    .columns(["topic_id", "language_code", "type"])
    .unique()
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("unique_topic_explanations_constraint").execute();
}
