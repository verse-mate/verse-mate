import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Fixing cleanup_user_data trigger to use correct column name...");

  // Drop and recreate the function with the correct column name
  await sql`
    CREATE OR REPLACE FUNCTION cleanup_user_data()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Delete all highlights for the user
      DELETE FROM verse_highlights WHERE user_id = OLD.id;

      -- Log the cleanup for audit purposes
      -- NOTE: Column is 'batch_type' not 'type'
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

  console.log("cleanup_user_data trigger fixed successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Reverting cleanup_user_data trigger to original version...");

  // Revert to the old version (with the bug)
  await sql`
    CREATE OR REPLACE FUNCTION cleanup_user_data()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Delete all highlights for the user
      DELETE FROM verse_highlights WHERE user_id = OLD.id;

      -- Log the cleanup for audit purposes
      INSERT INTO batch_jobs (type, status, created_at, updated_at, metadata)
      VALUES (
        'user_cleanup',
        'completed',
        NOW(),
        NOW(),
        jsonb_build_object(
          'user_id', OLD.id,
          'cleanup_timestamp', NOW(),
          'highlights_deleted', (
            SELECT count(*)
            FROM verse_highlights
            WHERE user_id = OLD.id
          )
        )
      );

      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  console.log("cleanup_user_data trigger reverted");
}
