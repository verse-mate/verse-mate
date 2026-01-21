import type { Kysely } from "kysely";

/**
 * Data Migration: Originally fixed mismatched book introductions.
 *
 * This migration has been converted to a no-op because:
 * 1. The data was already fixed manually in production
 * 2. Migrations should not have external file imports (breaks in Docker)
 * 3. New databases get correct data from seeding anyway
 */
export async function up(_db: Kysely<unknown>): Promise<void> {
  console.log(
    "⏭️ Skipping book_introductions repair - handled manually, no external imports in migrations",
  );
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // No-op
}
