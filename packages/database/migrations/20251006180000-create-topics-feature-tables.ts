import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating topics feature tables...");

  // Create topics table
  await db.schema
    .createTable("topics")
    .addColumn("topic_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("category", "varchar(50)", (col) => col.notNull())
    .addColumn("sort_order", "integer")
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Create topic_references table
  await db.schema
    .createTable("topic_references")
    .addColumn("reference_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("topic_id", "uuid", (col) =>
      col.references("topics.topic_id").onDelete("cascade").notNull(),
    )
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_by_admin", "boolean", (col) => col.defaultTo(false))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Create topic_explanations table
  await db.schema
    .createTable("topic_explanations")
    .addColumn("explanation_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("topic_id", "uuid", (col) =>
      col.references("topics.topic_id").onDelete("cascade").notNull(),
    )
    .addColumn("type", "varchar(50)", (col) => col.notNull())
    .addColumn("explanation", "text", (col) => col.notNull())
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    .addColumn("version", "integer", (col) => col.defaultTo(1))
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("default", "boolean", (col) => col.defaultTo(false))
    .addColumn("parent_explanation_id", "uuid", (col) =>
      col.references("topic_explanations.explanation_id"),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Add indexes for performance
  await db.schema
    .createIndex("idx_topics_category")
    .on("topics")
    .column("category")
    .execute();

  await db.schema
    .createIndex("idx_topic_references_topic_id")
    .on("topic_references")
    .column("topic_id")
    .execute();

  await db.schema
    .createIndex("idx_topic_explanations_topic_id")
    .on("topic_explanations")
    .column("topic_id")
    .execute();

  // Add unique constraints for active content
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_active_topic_reference ON topic_references (topic_id) WHERE is_active = true`.compile(
      db,
    ),
  );

  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_active_topic_explanation ON topic_explanations (topic_id, language_code, type) WHERE is_active = true`.compile(
      db,
    ),
  );

  console.log("Successfully created topics feature tables.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping topics feature tables...");

  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_active_topic_explanation`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_active_topic_reference`.compile(db),
  );

  await db.schema.dropTable("topic_explanations").ifExists().execute();
  await db.schema.dropTable("topic_references").ifExists().execute();
  await db.schema.dropTable("topics").ifExists().execute();

  console.log("Successfully dropped topics feature tables.");
}
