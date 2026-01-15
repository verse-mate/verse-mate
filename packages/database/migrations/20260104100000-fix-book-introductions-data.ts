import type { Kysely } from "kysely";
import type Database from "../src/models/Database";
import introsData from "../src/seeds/data/book-intros.json";

/**
 * Data Migration: Fixes mismatched book introductions by clearing the table
 * and re-seeding from the correct source JSON.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("🛠️ Data Migration: Repairing book_introductions table...");

  // Check if books table has data (skip if empty - happens in CI where seeding runs after migrations)
  const booksCount = await db
    .selectFrom("books" as any)
    .select(db.fn.count("book_id").as("count"))
    .executeTakeFirst();

  if (!booksCount || Number(booksCount.count) === 0) {
    console.log(
      "⏭️ Skipping book_introductions repair - books table is empty (will be seeded later)",
    );
    return;
  }

  // 1. Clear existing corrupted data
  await db.deleteFrom("book_introductions").execute();

  // 2. Re-insert data from the correct JSON source
  const typedIntrosData = introsData as Record<string, any>;
  const entries = Object.entries(typedIntrosData);

  for (const [key, intro] of entries) {
    const bookId = intro.book_id ?? Number(key);

    // We cast to any here because the payload includes all fields from the JSON
    // which match the table schema.
    await db
      .insertInto("book_introductions" as any)
      .values({
        ...intro,
        book_id: bookId,
        // Ensure arrays are initialized correctly
        key_themes: intro.key_themes || [],
      } as any)
      .execute();
  }

  console.log(
    `✅ Successfully re-seeded ${entries.length} book introductions.`,
  );
}

export async function down(_db: Kysely<Database>): Promise<void> {
  // Rollback for data fixes typically doesn't revert to "corrupted" data.
  // We leave the table as is.
}
