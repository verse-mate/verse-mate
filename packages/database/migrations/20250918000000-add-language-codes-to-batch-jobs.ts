import type { Kysely } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "Adding source_language_code and target_language_code columns to batch_jobs table",
  );

  // Add source_language_code column
  await db.schema
    .alterTable("batch_jobs")
    .addColumn("source_language_code", "varchar(10)")
    .execute();

  // Add target_language_code column
  await db.schema
    .alterTable("batch_jobs")
    .addColumn("target_language_code", "varchar(10)")
    .execute();

  // Create indexes for efficient querying
  await db.schema
    .createIndex("idx_batch_jobs_source_language_code")
    .on("batch_jobs")
    .column("source_language_code")
    .execute();

  await db.schema
    .createIndex("idx_batch_jobs_target_language_code")
    .on("batch_jobs")
    .column("target_language_code")
    .execute();

  console.log("Successfully added language code columns to batch_jobs table");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Removing language code columns from batch_jobs table");

  // Drop indexes first
  await db.schema.dropIndex("idx_batch_jobs_source_language_code").execute();

  await db.schema.dropIndex("idx_batch_jobs_target_language_code").execute();

  // Drop columns
  await db.schema
    .alterTable("batch_jobs")
    .dropColumn("source_language_code")
    .execute();

  await db.schema
    .alterTable("batch_jobs")
    .dropColumn("target_language_code")
    .execute();

  console.log(
    "Successfully removed language code columns from batch_jobs table",
  );
}
