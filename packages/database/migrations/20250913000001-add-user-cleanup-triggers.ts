import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Create a function to clean up user-related data when a user is deleted
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

  // Create a trigger that runs before user deletion
  await sql`
    CREATE TRIGGER trigger_cleanup_user_data
    BEFORE DELETE ON "user"
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_user_data();
  `.execute(db);

  // Create an index on created_at for efficient cleanup queries
  await db.schema
    .createIndex("idx_verse_highlights_user_created")
    .on("verse_highlights")
    .columns(["user_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop the trigger
  await sql`DROP TRIGGER IF EXISTS trigger_cleanup_user_data ON "user";`.execute(
    db,
  );

  // Drop the function
  await sql`DROP FUNCTION IF EXISTS cleanup_user_data();`.execute(db);

  // Drop the index
  await db.schema.dropIndex("idx_verse_highlights_user_created").execute();
}
