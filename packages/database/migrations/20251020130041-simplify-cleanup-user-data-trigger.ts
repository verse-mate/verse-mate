import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "Simplifying cleanup_user_data trigger (removing batch_jobs logging)...",
  );

  // Recreate the function without the batch_jobs insert that causes FK constraint issues
  await sql`
    CREATE OR REPLACE FUNCTION cleanup_user_data()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Delete all highlights for the user
      DELETE FROM verse_highlights WHERE user_id = OLD.id;

      -- Note: Removed batch_jobs logging as it creates circular FK dependency
      -- The user being deleted can't be referenced in batch_jobs.created_by

      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  console.log("cleanup_user_data trigger simplified successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Reverting cleanup_user_data trigger to previous version...");

  // Revert to the previous version (with batch_type)
  await sql`
    CREATE OR REPLACE FUNCTION cleanup_user_data()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Delete all highlights for the user
      DELETE FROM verse_highlights WHERE user_id = OLD.id;

      -- Log the cleanup for audit purposes
      INSERT INTO batch_jobs (batch_type, status, created_at, created_by, bible_version, model, explanation_types)
      VALUES (
        'user_cleanup',
        'completed',
        NOW(),
        OLD.id,
        'NASB1995',
        'gpt-4',
        ARRAY[]::text[]
      );

      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  console.log("cleanup_user_data trigger reverted");
}
