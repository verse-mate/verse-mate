import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Deterministic dictionary for the inductive-study "label-like" fields — the
 * short, closed-vocabulary tokens inside a study's content that the AI
 * translate batch occasionally leaks back in English:
 *
 *   - `tag` PILLS — the 9 observation tags, universal across all 1,189
 *     studies (POSTURE, EYES, WILL, WHO, TO WHOM, WHEN, WHERE, WHY, HOW).
 *   - contrast `type` (Contrast / Comparison / Metaphor / …).
 *   - list `columns` (Verse / Truth / …).
 *   - `book_name` for the study title ("James 2" → "Iacov 2").
 *
 * These are a tiny fixed set, so rather than trust the model per-chapter we
 * overwrite any value that comes back as a known ENGLISH source term with the
 * target-language term from this table. Correct translations and verse-refs
 * (e.g. "3:1") aren't in the source set, so they're never touched.
 *
 * DB-managed, same convention as `study_labels` / `prompts`: adding a language
 * = seed its rows; adding a new term or even a new `term_type` = insert rows.
 * The applier (processStudyTranslateOutputFile + normalize-study-terms.ts) is
 * generic over `term_type`, so no code changes to extend coverage.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating study_term_translations table...");

  await db.schema
    .createTable("study_term_translations")
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    // pill | contrast_type | list_column | book_name (free text — generic).
    .addColumn("term_type", "varchar(30)", (col) => col.notNull())
    // The English source token as it appears in studies.content.
    .addColumn("source_en", "varchar(100)", (col) => col.notNull())
    // The target-language replacement.
    .addColumn("target_term", "varchar(100)", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("unique_study_term", [
      "language_code",
      "term_type",
      "source_en",
    ])
    .execute();

  await db.schema
    .createIndex("idx_study_term_translations_lang")
    .on("study_term_translations")
    .column("language_code")
    .execute();

  console.log("Successfully created study_term_translations table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("study_term_translations").ifExists().execute();
}
