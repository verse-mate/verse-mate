import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20261011150000-coach-reports-and-roster";

const TABLES = [
  "coach_learning_join_requests",
  "coach_learning_submissions",
  "coach_learning_lesson_completions",
  "coach_learning_enrolments",
  "coach_learning_questions",
  "coach_learning_lessons",
  "coach_learning_modules",
];

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await db.schema
    .createTable("coach_learning_modules")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("pass_mark", "integer", (col) =>
      col.notNull().defaultTo(70).check(sql`pass_mark BETWEEN 1 AND 100`),
    )
    .addColumn("published", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("check_version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("coach_learning_lessons")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("module_id", "integer", (col) =>
      col.notNull().references("coach_learning_modules.id"),
    )
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("body", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("passages", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("published", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("video_key", "text")
    .addColumn("video_type", "text", (col) =>
      col.check(sql`video_type IN ('video/mp4', 'video/webm')`),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await db.schema
    .createIndex("coach_learning_lessons_module_idx")
    .on("coach_learning_lessons")
    .columns(["module_id", "position"])
    .execute();

  await db.schema
    .createTable("coach_learning_questions")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("module_id", "integer", (col) =>
      col.notNull().references("coach_learning_modules.id").onDelete("cascade"),
    )
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("prompt", "text", (col) => col.notNull())
    .addColumn("options", sql`text[]`, (col) =>
      col.notNull().check(sql`cardinality(options) BETWEEN 2 AND 6`),
    )
    .addColumn("correct", "integer", (col) =>
      col.notNull().check(sql`correct >= 0 AND correct < cardinality(options)`),
    )
    .execute();
  await db.schema
    .createIndex("coach_learning_questions_module_idx")
    .on("coach_learning_questions")
    .columns(["module_id", "position"])
    .execute();

  await db.schema
    .createTable("coach_learning_enrolments")
    .addColumn("user_id", "uuid", (col) =>
      col.primaryKey().references("user.id").onDelete("cascade"),
    )
    .addColumn("enrolled_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("completed_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("coach_learning_lesson_completions")
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("lesson_id", "integer", (col) =>
      col.notNull().references("coach_learning_lessons.id"),
    )
    .addColumn("done_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("coach_learning_lesson_completions_pk", [
      "user_id",
      "lesson_id",
    ])
    .execute();
  await db.schema
    .createIndex("coach_learning_lesson_completions_lesson_idx")
    .on("coach_learning_lesson_completions")
    .column("lesson_id")
    .execute();

  await db.schema
    .createTable("coach_learning_submissions")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("module_id", "integer", (col) =>
      col.notNull().references("coach_learning_modules.id"),
    )
    .addColumn("correct", "integer", (col) => col.notNull())
    .addColumn("total", "integer", (col) => col.notNull())
    .addColumn("passed", "boolean", (col) => col.notNull())
    .addColumn("submitted_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await db.schema
    .createIndex("coach_learning_submissions_user_idx")
    .on("coach_learning_submissions")
    .columns(["user_id", "module_id"])
    .execute();
  await db.schema
    .createIndex("coach_learning_submissions_module_idx")
    .on("coach_learning_submissions")
    .column("module_id")
    .execute();

  await db.schema
    .createTable("coach_learning_join_requests")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("note", "text", (col) =>
      col.notNull().defaultTo("").check(sql`char_length(note) <= 500`),
    )
    .addColumn("status", "text", (col) =>
      col
        .notNull()
        .defaultTo("open")
        .check(
          sql`status IN ('open', 'approved', 'declined', 'already-in-program')`,
        ),
    )
    .addColumn("reason", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("answered_at", "timestamptz")
    .addColumn("answered_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .execute();
  await sql`
    CREATE UNIQUE INDEX coach_learning_join_requests_standing_uidx
    ON coach_learning_join_requests (user_id) WHERE status <> 'declined'
  `.execute(db);
  await db.schema
    .createIndex("coach_learning_join_requests_status_idx")
    .on("coach_learning_join_requests")
    .columns(["status", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const table of TABLES) await refuseToDrop(db, table);
  for (const table of TABLES) await db.schema.dropTable(table).execute();
}
