import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating user_recently_viewed_books table...");

  // Create user_recently_viewed_books table
  await db.schema
    .createTable("user_recently_viewed_books")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("book_id", "integer", (col) =>
      col.references("books.book_id").onDelete("cascade").notNull(),
    )
    .addColumn("last_viewed_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  // Add unique constraint to prevent duplicate user-book combinations
  await db.schema
    .createIndex("idx_user_recently_viewed_books_user_book")
    .on("user_recently_viewed_books")
    .columns(["user_id", "book_id"])
    .unique()
    .execute();

  // Add index for efficient querying of recently viewed books
  await db.schema
    .createIndex("idx_user_recently_viewed_books_user_time")
    .on("user_recently_viewed_books")
    .columns(["user_id", "last_viewed_at"])
    .execute();

  console.log("user_recently_viewed_books table created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping user_recently_viewed_books table...");

  await db.schema.dropTable("user_recently_viewed_books").execute();

  console.log("user_recently_viewed_books table dropped successfully");
}
