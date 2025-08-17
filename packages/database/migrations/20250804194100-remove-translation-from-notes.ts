import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Drop the old index that included translation
  await db.schema.dropIndex("notes_user_chapter_translation_idx").execute();

  // Remove the translation column
  await db.schema.alterTable("notes").dropColumn("translation").execute();

  // Create new index without translation
  await db.schema
    .createIndex("notes_user_chapter_idx")
    .on("notes")
    .columns(["user_id", "chapter_id"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop the new index
  await db.schema.dropIndex("notes_user_chapter_idx").execute();

  // Add back the translation column
  await db.schema
    .alterTable("notes")
    .addColumn("translation", "varchar(50)", (col) =>
      col.notNull().defaultTo(""),
    )
    .execute();

  // Recreate the old index
  await db.schema
    .createIndex("notes_user_chapter_translation_idx")
    .on("notes")
    .columns(["user_id", "chapter_id", "translation"])
    .execute();
}
