import type { Kysely } from "kysely";
import { sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("batch_jobs")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("batch_type", "varchar(20)", (col) => col.notNull())
    .addColumn("openai_batch_id", "varchar(100)")
    .addColumn("status", "varchar(20)", (col) =>
      col.notNull().defaultTo("pending"),
    )
    .addColumn("book_id", "integer", (col) => col.references("books.book_id"))
    .addColumn("bible_version", "varchar(10)", (col) => col.notNull())
    .addColumn("model", "varchar(50)", (col) => col.notNull())
    .addColumn("explanation_types", sql`text[]`, (col) => col.notNull())
    .addColumn("total_requests", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("completed_requests", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("failed_requests", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("input_file_path", "varchar(500)")
    .addColumn("output_file_path", "varchar(500)")
    .addColumn("total_tokens", "integer")
    .addColumn("prompt_tokens", "integer")
    .addColumn("completion_tokens", "integer")
    .addColumn("estimated_cost", "real")
    .addColumn("actual_cost", "real")
    .addColumn("created_by", "uuid", (col) =>
      col.references("user.id").notNull(),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn("started_at", "timestamp")
    .addColumn("completed_at", "timestamp")
    .addColumn("error_message", "text")
    .execute();

  await db.schema
    .createIndex("idx_batch_jobs_status")
    .on("batch_jobs")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_batch_jobs_created_by")
    .on("batch_jobs")
    .column("created_by")
    .execute();

  await db.schema
    .createIndex("idx_batch_jobs_openai_batch_id")
    .on("batch_jobs")
    .column("openai_batch_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("batch_jobs").execute();
}
