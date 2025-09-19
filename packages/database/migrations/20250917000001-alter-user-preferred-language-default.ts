import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // First, update existing users from 'en' to NULL to ensure consistent behavior
  await db
    .updateTable("user")
    .set({ preferred_language: null })
    .where("preferred_language", "=", "en")
    .execute();

  // Then, drop the default constraint for future users
  await db.schema
    .alterTable("user")
    .alterColumn("preferred_language", (col) => col.dropDefault())
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Restore the default constraint for future users
  await db.schema
    .alterTable("user")
    .alterColumn("preferred_language", (col) => col.setDefault("en"))
    .execute();

  // Optionally, you could revert the NULL values back to 'en' for consistency on rollback
  await db
    .updateTable("user")
    .set({ preferred_language: "en" })
    .where("preferred_language", "is", null)
    .execute();
}
