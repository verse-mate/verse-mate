import type { Kysely } from "kysely";
import { sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("explanations")
    .addColumn("version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_by_admin", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("parent_explanation_id", "integer", (col) =>
      col.references("explanations.explanation_id"),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_explanations_chap_type`.compile(db),
  );

  await db.executeQuery(
    sql`CREATE UNIQUE INDEX idx_explanations_chap_type_active ON explanations(chapter_id, type) WHERE is_active = true`.compile(
      db,
    ),
  );

  await db.executeQuery(
    sql`UPDATE explanations SET version = 1, is_active = true, created_by_admin = false WHERE version IS NULL`.compile(
      db,
    ),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_explanations_chap_type_active`.compile(db),
  );

  await db.executeQuery(
    sql`CREATE UNIQUE INDEX idx_explanations_chap_type ON explanations(chapter_id, type)`.compile(
      db,
    ),
  );

  await db.schema
    .alterTable("explanations")
    .dropColumn("version")
    .dropColumn("is_active")
    .dropColumn("created_by_admin")
    .dropColumn("parent_explanation_id")
    .dropColumn("created_at")
    .execute();
}
