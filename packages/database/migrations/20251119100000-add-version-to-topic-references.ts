import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding versioning to topic references...");

  // 1. Add version column
  await db.schema
    .alterTable("topic_references")
    .addColumn("version", "integer", (col) => col.defaultTo(1).notNull())
    .execute();

  // 2. Drop the old unique index if it exists (it was: (topic_id) WHERE is_active = true)
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_active_topic_reference`.compile(db),
  );

  // 3. Re-create the unique index.
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_active_topic_reference ON topic_references (topic_id) WHERE is_active = true`.compile(
      db,
    ),
  );

  console.log("Successfully added versioning to topic references.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Reverting topic references versioning...");

  await db.schema
    .alterTable("topic_references")
    .dropColumn("version")
    .execute();

  // The unique index on is_active depends on topic_id, so it stays valid/relevant even without version column.
  // But if we dropped it in UP, we should ensure it exists here.
  // Since we re-created it in UP with the same definition, we don't strictly need to do anything complex here,
  // but ideally we'd ensure the state matches the previous migration.
}
