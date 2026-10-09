import type { Kysely } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_reports")
    .addColumn("first_lesson_line", "text")
    .dropColumn("passage_book")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_reports", "first_lesson_line IS NOT NULL");
  await db.schema
    .alterTable("coach_reports")
    .addColumn("passage_book", "text")
    .dropColumn("first_lesson_line")
    .execute();
}
