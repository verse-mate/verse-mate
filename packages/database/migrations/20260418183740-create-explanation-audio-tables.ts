import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating explanation audio tables...");

  await db.schema
    .createTable("explanation_audios")
    .addColumn("audio_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("explanation_id", "integer", (col) =>
      col
        .references("explanations.explanation_id")
        .onDelete("cascade")
        .notNull(),
    )
    .addColumn("voice", "varchar(50)", (col) => col.notNull())
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    .addColumn("storage_key", "text", (col) => col.notNull())
    .addColumn("duration_seconds", "numeric(8, 2)", (col) => col.notNull())
    .addColumn("character_count", "integer", (col) => col.notNull())
    .addColumn("content_hash", "varchar(64)", (col) => col.notNull())
    .addColumn("tts_provider", "varchar(50)", (col) => col.notNull())
    .addColumn("tts_model", "varchar(100)", (col) => col.notNull())
    .addColumn("is_stale", "boolean", (col) => col.defaultTo(false).notNull())
    .addColumn("generated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  await db.schema
    .createIndex("idx_explanation_audios_variant")
    .on("explanation_audios")
    .columns(["explanation_id", "voice", "language_code"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_explanation_audios_stale_generated")
    .on("explanation_audios")
    .columns(["is_stale", "generated_at"])
    .execute();

  await db.schema
    .createTable("explanation_audio_progress")
    .addColumn("progress_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("explanation_id", "integer", (col) =>
      col
        .references("explanations.explanation_id")
        .onDelete("cascade")
        .notNull(),
    )
    .addColumn("position_seconds", "numeric(8, 2)", (col) => col.notNull())
    .addColumn("duration_seconds", "numeric(8, 2)", (col) => col.notNull())
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  await db.schema
    .createIndex("idx_explanation_audio_progress_user_explanation")
    .on("explanation_audio_progress")
    .columns(["user_id", "explanation_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_explanation_audio_progress_user_updated")
    .on("explanation_audio_progress")
    .columns(["user_id", "updated_at"])
    .execute();

  console.log("Successfully created explanation audio tables.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping explanation audio tables...");

  await db.schema.dropTable("explanation_audio_progress").ifExists().execute();
  await db.schema.dropTable("explanation_audios").ifExists().execute();

  console.log("Successfully dropped explanation audio tables.");
}
