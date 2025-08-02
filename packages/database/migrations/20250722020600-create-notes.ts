import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("notes")
    .addColumn("note_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.user_id").onDelete("cascade"),
    )
    .addColumn("book_name", "varchar(100)", (col) => col.notNull())
    .addColumn("chapter_number", "integer", (col) => col.notNull())
    .addColumn("translation", "varchar(50)", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  // Create index for efficient querying by user, book, chapter and translation
  await db.schema
    .createIndex("notes_user_book_chapter_translation_idx")
    .on("notes")
    .columns(["user_id", "book_name", "chapter_number", "translation"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("notes").execute();
}
