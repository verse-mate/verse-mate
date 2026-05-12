import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Drop Q&A (Ask VerseMate) feature tables and supporting enum.
 *
 * Per spec feat-domain-model + Phase 1 decision D-009: the Q&A feature is
 * disabled and never reached production. Removing it entirely from schema,
 * endpoints, and frontend.
 *
 * Tables removed:
 *   - conversations
 *   - messages (FK to conversations)
 *
 * Enum removed:
 *   - role_enum (only used by messages.role)
 *
 * The down migration recreates these — only useful if Q&A is reactivated.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Dropping Q&A tables and role_enum (D-009)...");

  // Drop messages first (FK to conversations)
  await db.schema.dropTable("messages").ifExists().execute();
  await db.schema.dropTable("conversations").ifExists().execute();

  // Drop the enum after the tables that referenced it
  await sql`DROP TYPE IF EXISTS role_enum`.execute(db);

  console.log("Successfully dropped Q&A tables and role_enum.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Reverting: recreating Q&A tables (debug only)...");

  await sql`CREATE TYPE role_enum AS ENUM ('user', 'assistant')`.execute(db);

  await db.schema
    .createTable("conversations")
    .addColumn("conversation_id", "serial", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("book_id", "integer", (col) => col.notNull())
    .addColumn("chapter_number", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  await db.schema
    .createTable("messages")
    .addColumn("message_id", "serial", (col) => col.primaryKey())
    .addColumn("conversation_id", "integer", (col) =>
      col
        .notNull()
        .references("conversations.conversation_id")
        .onDelete("cascade"),
    )
    .addColumn("role", sql`role_enum`, (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  console.log("Reverted Q&A tables.");
}
