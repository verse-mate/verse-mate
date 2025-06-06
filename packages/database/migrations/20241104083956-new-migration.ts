import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createType("testament_enum").asEnum(["OT", "NT"]).execute();
  await db.schema
    .createType("explanation_type_enum")
    .asEnum(["summary", "byline", "detailed"])
    .execute();
  await db.schema
    .createType("status_enum")
    .asEnum(["active", "inactive", "archived"])
    .execute();
  await db.schema
    .createType("role_enum")
    .asEnum(["user", "assistant"])
    .execute();
  await db.schema
    .createType("favorite_type_enum")
    .asEnum(["chapter", "message"])
    .execute();

  await db.schema
    .createTable("genres")
    .addColumn("genre_id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar(50)", (col) => col.notNull().unique())
    .execute();

  await db.schema
    .createTable("books")
    .addColumn("book_id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar(50)", (col) => col.notNull().unique())
    .addColumn("testament", sql`testament_enum`, (col) => col.notNull())
    .addColumn("genre_id", "integer", (col) =>
      col.references("genres.genre_id").onDelete("cascade").notNull(),
    )
    .execute();

  await db.schema
    .createTable("chapters")
    .addColumn("chapter_id", "serial", (col) => col.primaryKey())
    .addColumn("book_id", "integer", (col) =>
      col.references("books.book_id").onDelete("cascade").notNull(),
    )
    .addColumn("chapter_number", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("subtitles")
    .addColumn("subtitle_id", "serial", (col) => col.primaryKey())
    .addColumn("chapter_id", "integer", (col) =>
      col.references("chapters.chapter_id").onDelete("cascade").notNull(),
    )
    .addColumn("subtitle", "varchar(250)", (col) => col.notNull())
    .addColumn("start_verse", "integer", (col) => col.notNull())
    .addColumn("end_verse", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("verses")
    .addColumn("verse_id", "serial", (col) => col.primaryKey())
    .addColumn("chapter_id", "integer", (col) =>
      col.references("chapters.chapter_id").onDelete("cascade").notNull(),
    )
    .addColumn("verse_number", "integer", (col) => col.notNull())
    .addColumn("text", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("explanations")
    .addColumn("explanation_id", "serial", (col) => col.primaryKey())
    .addColumn("type", sql`explanation_type_enum`, (col) => col.notNull())
    .addColumn("explanation", "text", (col) => col.notNull())
    .addColumn("chapter_id", "integer", (col) =>
      col.references("chapters.chapter_id").onDelete("cascade").notNull(),
    )
    .execute();

  await db.schema
    .createTable("explanation_ratings")
    .addColumn("rating_id", "serial", (col) => col.primaryKey())
    .addColumn("stars", "integer", (col) => col.notNull())
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("explanation_id", "integer", (col) =>
      col
        .references("explanations.explanation_id")
        .onDelete("cascade")
        .notNull(),
    )
    .execute();

  await db.schema
    .createTable("conversations")
    .addColumn("conversation_id", "serial", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("title", "varchar(250)", (col) => col.notNull())
    .addColumn("chapter_id", "integer", (col) =>
      col.references("chapters.chapter_id").onDelete("cascade").notNull(),
    )
    .addColumn("status", sql`status_enum`, (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) => col.defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamp", (col) => col.defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("messages")
    .addColumn("message_id", "serial", (col) => col.primaryKey())
    .addColumn("conversation_id", "integer", (col) =>
      col
        .references("conversations.conversation_id")
        .onDelete("cascade")
        .notNull(),
    )
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("role" as any, sql`role_enum`, (col) => col.notNull())
    .addColumn("generated_at", "timestamp", (col) => col.defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("favorites")
    .addColumn("favorite_id", "serial", (col) => col.primaryKey())
    .addColumn("type", sql`favorite_type_enum`, (col) => col.notNull())
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("chapter_id", "integer", (col) =>
      col.references("chapters.chapter_id").onDelete("cascade").notNull(),
    )
    .addColumn("message_id", "integer", (col) =>
      col.references("messages.message_id").onDelete("cascade").notNull(),
    )
    .execute();

  await db.schema
    .createTable("user_progress")
    .addColumn("user_progress_id", "serial", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("book_id", "integer", (col) =>
      col.references("books.book_id").onDelete("cascade").notNull(),
    )
    .addColumn("chapter_id", "integer", (col) =>
      col.references("chapters.chapter_id").onDelete("cascade").notNull(),
    )
    .addColumn("last_visited_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("favorites").execute();
  await db.schema.dropTable("user_progress").execute();
  await db.schema.dropTable("messages").execute();
  await db.schema.dropTable("conversations").execute();
  await db.schema.dropTable("explanation_ratings").execute();
  await db.schema.dropTable("explanations").execute();
  await db.schema.dropTable("verses").execute();
  await db.schema.dropTable("subtitles").execute();
  await db.schema.dropTable("chapters").execute();
  await db.schema.dropTable("books").execute();
  await db.schema.dropTable("genres").execute();
  await db.schema.dropType("favorite_type_enum").execute();
  await db.schema.dropType("role_enum").execute();
  await db.schema.dropType("status_enum").execute();
  await db.schema.dropType("explanation_type_enum").execute();
  await db.schema.dropType("testament_enum").execute();
}
