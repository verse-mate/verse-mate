import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding max_output_tokens column to batch_jobs table...");

  await db.schema
    .alterTable("batch_jobs")
    .addColumn("max_output_tokens", "integer")
    .execute();

  console.log(
    "Successfully added max_output_tokens column to batch_jobs table.",
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Removing max_output_tokens column from batch_jobs table...");
  await db.schema
    .alterTable("batch_jobs")
    .dropColumn("max_output_tokens")
    .execute();
  console.log(
    "Successfully removed max_output_tokens column from batch_jobs table.",
  );
}
