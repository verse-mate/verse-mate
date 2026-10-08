import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_reports")
    .addColumn("passage_book", "text")
    .addColumn("first_lesson", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("first_lesson_source", "text", (col) =>
      col.check(sql`first_lesson_source IN ('detected', 'admin')`),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(
    db,
    "coach_reports",
    "first_lesson OR first_lesson_source IS NOT NULL OR passage_book IS NOT NULL",
  );
  await db.schema
    .alterTable("coach_reports")
    .dropColumn("first_lesson_source")
    .dropColumn("first_lesson")
    .dropColumn("passage_book")
    .execute();
}
