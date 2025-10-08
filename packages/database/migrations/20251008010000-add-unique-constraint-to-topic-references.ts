import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding unique constraint to topic_references.topic_id...");

  await db.schema
    .alterTable("topic_references")
    .addUniqueConstraint("unique_topic_references_topic_id", ["topic_id"])
    .execute();

  console.log("Successfully added unique constraint.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping unique constraint from topic_references.topic_id...");

  await db.schema
    .alterTable("topic_references")
    .dropConstraint("unique_topic_references_topic_id")
    .execute();

  console.log("Successfully dropped unique constraint.");
}
