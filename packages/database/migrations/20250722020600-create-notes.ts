import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("notes")
    .addColumn("note_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("chapter_id", "integer", (col) =>
      col.references("chapters.chapter_id").onDelete("cascade").notNull(),
    )
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
    .createIndex("notes_user_chapter_translation_idx")
    .on("notes")
    .columns(["user_id", "chapter_id", "translation"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("notes").execute();
}
