import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Inductive-study (Precept method) content store.
 *
 * Why move studies from the @versemate/studies package to the DB — same
 * rationale as the lemmas migration (20260527000000): the content is a
 * large bundled asset (1,189 chapter modules) shared by web AND mobile,
 * the two ship on separate release cycles, and per the feat-i18n /
 * br-i18n-002 convention translatable content should be server-side with
 * an English fallback when the target language has no translation.
 *
 * Schema follows the established `topics`/`topic_translations` +
 * `lemmas`/`lemma_translations` split:
 *
 *   studies             — one row per (book_id, chapter). Holds the ENGLISH
 *                         baseline study as a single `content` jsonb blob
 *                         (the full InductiveStudy object). `content_hash`
 *                         makes ingest idempotent and lets translations
 *                         detect when the English source changed.
 *
 *   study_translations  — one row per (study_id, language_code) for
 *                         language_code != 'en-US'. `translated_content`
 *                         holds the full translated InductiveStudy.
 *                         `source_content_hash` records which English
 *                         revision the translation was produced from, so
 *                         stale translations can be re-run.
 *
 * Studies are a single self-contained JSON document per chapter (steps +
 * interpretation + application), so unlike lemmas we keep ONE jsonb column
 * rather than per-field translated_* columns. The InductiveStudy type
 * already tolerates AI-emitted extra keys, so JSON round-trips cleanly.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating studies table...");

  await db.schema
    .createTable("studies")
    .addColumn("study_id", "serial", (col) => col.primaryKey())
    // NB: book_id here is the CANONICAL book number used by the
    // @versemate/studies package (Genesis=1 … James=59 … Revelation=66) — the
    // same id space the study LOADERS map and getStudyFor() use. It is
    // intentionally NOT a foreign key to `books.book_id`, because the `books`
    // table uses an unrelated surrogate id space (e.g. James=28). Keying
    // studies by the canonical id keeps this endpoint behaviour-identical to
    // the bundled getStudyFor(bookId, chapter) it replaces.
    .addColumn("book_id", "integer", (col) => col.notNull())
    .addColumn("chapter", "integer", (col) => col.notNull())
    // Full English InductiveStudy object.
    .addColumn("content", "jsonb", (col) => col.notNull())
    // sha256 of the canonical source JSON — idempotent ingest + staleness.
    .addColumn("content_hash", "varchar(64)")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("unique_study_chapter", ["book_id", "chapter"])
    .execute();

  console.log("Successfully created studies table.");
  console.log("Creating study_translations table...");

  await db.schema
    .createTable("study_translations")
    .addColumn("translation_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("study_id", "integer", (col) =>
      col.references("studies.study_id").onDelete("cascade").notNull(),
    )
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    // Full translated InductiveStudy object.
    .addColumn("translated_content", "jsonb", (col) => col.notNull())
    // Which English content_hash this translation was produced from.
    .addColumn("source_content_hash", "varchar(64)")
    // Provenance — model id / batch label (e.g. "gpt-5-nano").
    .addColumn("source", "varchar(50)")
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("unique_study_translation", [
      "study_id",
      "language_code",
    ])
    .execute();

  // Language-only lookups (e.g. "all Spanish study translations").
  await db.schema
    .createIndex("idx_study_translations_language")
    .on("study_translations")
    .column("language_code")
    .execute();

  console.log("Successfully created study_translations table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("study_translations").ifExists().execute();
  await db.schema.dropTable("studies").ifExists().execute();
}
