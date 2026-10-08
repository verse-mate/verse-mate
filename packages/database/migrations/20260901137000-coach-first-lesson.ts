import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

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
  await db.schema
    .alterTable("coach_reports")
    .dropColumn("first_lesson_source")
    .dropColumn("first_lesson")
    .dropColumn("passage_book")
    .execute();
}
