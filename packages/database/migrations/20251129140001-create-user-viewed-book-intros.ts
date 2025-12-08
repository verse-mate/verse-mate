import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating user_viewed_book_introductions table...");

  // Create user_viewed_book_introductions table
  await db.schema
    .createTable("user_viewed_book_introductions")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("book_id", "integer", (col) =>
      col.references("books.book_id").onDelete("cascade").notNull(),
    )
    .addColumn("viewed_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  // Add unique constraint to prevent duplicate viewing records
  await db.schema
    .createIndex("unique_user_book_intro")
    .on("user_viewed_book_introductions")
    .columns(["user_id", "book_id"])
    .unique()
    .execute();

  // Create index for user lookup
  await db.schema
    .createIndex("idx_user_viewed_intros")
    .on("user_viewed_book_introductions")
    .column("user_id")
    .execute();

  console.log("Successfully created user_viewed_book_introductions table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping user_viewed_book_introductions table...");

  // Drop indexes
  await db.schema.dropIndex("idx_user_viewed_intros").execute();
  await db.schema.dropIndex("unique_user_book_intro").execute();

  // Drop table
  await db.schema.dropTable("user_viewed_book_introductions").execute();

  console.log("Successfully dropped user_viewed_book_introductions table.");
}
