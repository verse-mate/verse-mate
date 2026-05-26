import type { Kysely } from "kysely";
import { sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Server-side lemma store.
 *
 * Schema convention matches `topics` + `topic_translations` already in
 * production: the base table holds universal fields AND the English
 * baseline; only non-English rows live in the translations table. English
 * is the default language and is never stored in `lemma_translations`.
 *
 * Why move lemmas from @versemate/lexicon's _lemmas.json to the DB:
 *   - mobile (verse-mate-mobile) is on a separate release cycle from web;
 *     shipping a 16 MB JSON via npm-bundled package means every translation
 *     update is gated on a TestFlight/Play Store release
 *   - per-user language preference already lives server-side
 *     (user.preferred_language). Serving translated cards via the API lets
 *     both web and mobile share one source of truth without drift
 *   - per spec feat-i18n + br-i18n-002 (CLAUDE.md), translatable content
 *     should be server-side with English fallback when target language has
 *     no translation
 *
 * Tables:
 *
 *   lemmas              — one row per Strong's. Holds:
 *                           - universal fields (Greek/Hebrew lemma,
 *                             transliteration, Strong's, frequency, the
 *                             `loaded` tap-worthy flag)
 *                           - ENGLISH baseline content (pos, basic_gloss,
 *                             semantic_range, notes, related) — same fields
 *                             the `topics` table holds for its English
 *                             name/description
 *
 *   lemma_translations  — one row per (strongs, language_code) for
 *                         language_code != 'en'. Field names mirror the
 *                         topic_translations convention (translated_*).
 *
 * Scope of initial seed: the ~2,166 lemmas where `loaded = true` get
 * English baseline data + 10-language translations. The remaining ~16K
 * lemmas only get the universal fields in lemmas (no English text), since
 * the frontend filter only underlines `loaded` lemmas — they'd never be
 * tapped anyway.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // 1. lemmas — universal + English baseline. Same pattern as `topics`:
  //    English content lives directly on the row; non-English rendered
  //    via lemma_translations join.
  await db.schema
    .createTable("lemmas")
    .addColumn("strongs", "varchar(8)", (col) => col.primaryKey())
    // Universal (language-agnostic)
    .addColumn("lemma", "varchar(64)", (col) => col.notNull())
    .addColumn("translit", "varchar(64)")
    .addColumn("pronunciation", "varchar(64)")
    .addColumn("nt_frequency", "integer")
    .addColumn("ot_frequency", "integer")
    .addColumn("loaded", "boolean", (col) => col.notNull().defaultTo(false))
    // English baseline (nullable — non-loaded lemmas may lack rich content)
    .addColumn("pos", "varchar(64)")
    .addColumn("basic_gloss", "text")
    .addColumn("semantic_range", "jsonb")
    .addColumn("notes", "text")
    .addColumn("related", "jsonb")
    .addColumn("created_at", "timestamp", (col) => col.defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamp", (col) => col.defaultTo(sql`now()`))
    .execute();

  await db.executeQuery(
    sql`CREATE INDEX IF NOT EXISTS idx_lemmas_loaded
        ON lemmas (loaded) WHERE loaded = true`.compile(db),
  );

  // 2. lemma_translations — non-English rows only. Mirrors
  //    topic_translations: id PK, FK to parent, language_code, translated_*
  //    fields, is_active, created_at, updated_at.
  await db.schema
    .createTable("lemma_translations")
    .addColumn("translation_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("strongs", "varchar(8)", (col) =>
      col.notNull().references("lemmas.strongs").onDelete("cascade"),
    )
    .addColumn("language_code", "varchar(5)", (col) => col.notNull())
    .addColumn("translated_pos", "varchar(64)")
    .addColumn("translated_basic_gloss", "text")
    .addColumn("translated_semantic_range", "jsonb")
    .addColumn("translated_notes", "text")
    .addColumn("translated_related", "jsonb")
    .addColumn("source", "varchar(32)")
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) => col.defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamp", (col) => col.defaultTo(sql`now()`))
    .execute();

  // Unique constraint on (strongs, language_code) — one translation per
  // (lemma, language). Same conceptual key as topic_translations'
  // (topic_id, language_code).
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_lemma_translations_strongs_lang
        ON lemma_translations (strongs, language_code)`.compile(db),
  );
  // Language-only lookups (e.g. "all Spanish translations").
  await db.executeQuery(
    sql`CREATE INDEX IF NOT EXISTS idx_lemma_translations_lang
        ON lemma_translations (language_code)`.compile(db),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_lemma_translations_lang`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_lemma_translations_strongs_lang`.compile(db),
  );
  await db.schema.dropTable("lemma_translations").execute();
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_lemmas_loaded`.compile(db),
  );
  await db.schema.dropTable("lemmas").execute();
}
