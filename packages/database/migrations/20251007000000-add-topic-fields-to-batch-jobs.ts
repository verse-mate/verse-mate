import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding topic-specific fields to batch_jobs table...");

  // Add topic_category column for topic-discovery batches
  await db.schema
    .alterTable("batch_jobs")
    .addColumn("topic_category", "varchar(50)")
    .execute();

  // Add topic_id column for topic-references and topic-explanations batches
  await db.schema
    .alterTable("batch_jobs")
    .addColumn("topic_id", "uuid", (col) =>
      col.references("topics.topic_id").onDelete("cascade"),
    )
    .execute();

  // Add explanation_type column for topic-explanations batches
  await db.schema
    .alterTable("batch_jobs")
    .addColumn("explanation_type", "varchar(50)")
    .execute();

  // Add indexes for performance
  await db.schema
    .createIndex("idx_batch_jobs_topic_category")
    .on("batch_jobs")
    .column("topic_category")
    .execute();

  await db.schema
    .createIndex("idx_batch_jobs_topic_id")
    .on("batch_jobs")
    .column("topic_id")
    .execute();

  await db.schema
    .createIndex("idx_batch_jobs_explanation_type")
    .on("batch_jobs")
    .column("explanation_type")
    .execute();

  console.log("Successfully added topic-specific fields to batch_jobs table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Removing topic-specific fields from batch_jobs table...");

  // Drop indexes
  await db.schema
    .dropIndex("idx_batch_jobs_explanation_type")
    .ifExists()
    .execute();

  await db.schema.dropIndex("idx_batch_jobs_topic_id").ifExists().execute();

  await db.schema
    .dropIndex("idx_batch_jobs_topic_category")
    .ifExists()
    .execute();

  // Drop columns
  await db.schema
    .alterTable("batch_jobs")
    .dropColumn("explanation_type")
    .execute();

  await db.schema.alterTable("batch_jobs").dropColumn("topic_id").execute();

  await db.schema
    .alterTable("batch_jobs")
    .dropColumn("topic_category")
    .execute();

  console.log(
    "Successfully removed topic-specific fields from batch_jobs table.",
  );
}
