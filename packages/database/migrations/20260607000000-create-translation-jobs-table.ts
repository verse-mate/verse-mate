import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Durable, resumable queue for the local `claude -p` translation worker. One
 * row = one user contract ("translate language X, kinds [...]" over a scope).
 * The worker (TranslationJobService.processJob) computes what is missing,
 * grinds through it sequentially, tracks progress here, and pauses on usage
 * limits (`status='paused'`, `paused_until`) so a later invocation resumes from
 * the same row. "Done" is always recomputed from the content tables
 * (explanations / study_translations) so a process restart is safe.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating translation_jobs table...");

  await db.schema
    .createTable("translation_jobs")
    .addColumn("job_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("target_language_code", "varchar(10)", (col) => col.notNull())
    .addColumn("source_language_code", "varchar(10)", (col) =>
      col.notNull().defaultTo("en-US"),
    )
    // Array of kind strings: commentary types (summary/byline/detailed) and/or
    // the literal "study".
    .addColumn("kinds", "jsonb", (col) => col.notNull())
    // 'bible' | 'book'
    .addColumn("scope_type", "varchar(10)", (col) => col.notNull())
    .addColumn("book_name", "varchar(100)")
    // Optional array of chapter numbers to restrict the scope.
    .addColumn("chapter_numbers", "jsonb")
    .addColumn("model", "varchar(50)", (col) => col.notNull())
    // CLAUDE_CONFIG_DIR of the subscription used to run this job.
    .addColumn("config_dir", "varchar(255)")
    // 'pending' | 'running' | 'paused' | 'completed' | 'failed'
    .addColumn("status", "varchar(20)", (col) =>
      col.notNull().defaultTo("pending"),
    )
    .addColumn("total_units", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("done_units", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("failed_units", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("paused_until", "timestamptz")
    .addColumn("last_error", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_translation_jobs_status")
    .on("translation_jobs")
    .column("status")
    .execute();

  console.log("Successfully created translation_jobs table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("translation_jobs").ifExists().execute();
}
