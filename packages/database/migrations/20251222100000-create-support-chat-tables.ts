import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "Creating support chat feature tables with multiple conversation support...",
  );

  // Enum for message sender
  await db.schema
    .createType("support_sender_enum")
    .asEnum(["user", "support"])
    .execute();

  // Enum for conversation status
  await db.schema
    .createType("support_status_enum")
    .asEnum(["open", "resolved"])
    .execute();

  // Table: support_conversations
  await db.schema
    .createTable("support_conversations")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("subject", "varchar(255)")
    .addColumn("slack_thread_ts", "varchar(50)", (col) =>
      col.notNull().unique(),
    )
    .addColumn("status", sql`support_status_enum`, (col) =>
      col.defaultTo("open").notNull(),
    )
    .addColumn("last_message_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Table: support_messages
  await db.schema
    .createTable("support_messages")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("conversation_id", "uuid", (col) =>
      col.references("support_conversations.id").onDelete("cascade").notNull(),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("sender", sql`support_sender_enum`, (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Indexes
  await db.schema
    .createIndex("idx_support_messages_conversation_id")
    .on("support_messages")
    .column("conversation_id")
    .execute();

  await db.schema
    .createIndex("idx_support_conversations_user_id")
    .on("support_conversations")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("idx_support_conversations_slack_thread_ts")
    .on("support_conversations")
    .column("slack_thread_ts")
    .execute();

  console.log("Successfully created support chat feature tables.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping support chat feature tables...");

  await db.schema.dropTable("support_messages").ifExists().execute();
  await db.schema.dropTable("support_conversations").ifExists().execute();
  await db.schema.dropType("support_status_enum").ifExists().execute();
  await db.schema.dropType("support_sender_enum").ifExists().execute();

  console.log("Successfully dropped support chat feature tables.");
}
