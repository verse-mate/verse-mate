import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "Dropping strict unique constraint on topic_references.topic_id to allow versioning...",
  );

  // Drop the constraint that prevents multiple rows per topic_id
  await db.schema
    .alterTable("topic_references")
    .dropConstraint("unique_topic_references_topic_id")
    .execute();

  console.log("Successfully dropped strict constraint.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log(
    "Re-adding strict unique constraint to topic_references.topic_id...",
  );

  // Note: This will fail if the table contains duplicates (multiple versions)
  await db.schema
    .alterTable("topic_references")
    .addUniqueConstraint("unique_topic_references_topic_id", ["topic_id"])
    .execute();

  console.log("Successfully re-added strict constraint.");
}
