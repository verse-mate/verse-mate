import type { Kysely } from "kysely";
import { sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Server-side lemma store.
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
 * Schema shape:
 *
 *   lemmas              — one row per Strong's, language-agnostic fields
 *                         (Greek/Hebrew script, Strong's, frequency, the
 *                         `loaded` tap-worthy flag, etc.)
 *   lemma_translations  — one row per (strongs, language_code), holds the
 *                         translatable fields (basic_gloss, semantic_range,
 *                         pos, notes, related). English is just another row
 *                         here so the fallback path is the same query.
 *
 * Why two tables: the LLM-translation batch produces per-language rows in
 * isolation. Joining means future translation updates touch only
 * lemma_translations — never the universal lemmas row.
 *
 * Scope of initial seed: the ~2,166 lemmas where `loaded = true` (the
 * lexicon team's existing curation of theologically tap-worthy words —
 * see verse-mate-lexicon/src/lemmas.ts conventions). The remaining ~16K
 * entries stay in the @versemate/lexicon JSON bundle for now since they're
 * never user-tappable anyway.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // 1. Lemmas — universal fields. Keyed on Strong's because that's the
  //    natural join key from verses.tokens[i].strongs.
  await db.schema
    .createTable("lemmas")
    .addColumn("strongs", "varchar(8)", (col) => col.primaryKey())
    .addColumn("lemma", "varchar(64)", (col) => col.notNull())
    .addColumn("translit", "varchar(64)")
    .addColumn("pronunciation", "varchar(64)")
    .addColumn("nt_frequency", "integer")
    .addColumn("ot_frequency", "integer")
    .addColumn("loaded", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();

  await db.executeQuery(
    sql`CREATE INDEX IF NOT EXISTS idx_lemmas_loaded
        ON lemmas (loaded) WHERE loaded = true`.compile(db),
  );

  // 2. Per-language translatable fields. Keyed on (strongs, language_code)
  //    so each language is independent and the LLM-translation batch can
  //    upsert one language at a time without touching others.
  await db.schema
    .createTable("lemma_translations")
    .addColumn("strongs", "varchar(8)", (col) =>
      col.notNull().references("lemmas.strongs").onDelete("cascade"),
    )
    .addColumn("language_code", "varchar(5)", (col) => col.notNull())
    .addColumn("pos", "varchar(64)")
    .addColumn("basic_gloss", "text")
    .addColumn("semantic_range", "jsonb")
    .addColumn("notes", "text")
    .addColumn("related", "jsonb")
    .addColumn("source", "varchar(32)")
    .addPrimaryKeyConstraint("lemma_translations_pk", [
      "strongs",
      "language_code",
    ])
    .execute();

  // Index for "all translations of this lemma" lookups; the PK already
  // covers (strongs, language_code) so this fills in the lang-only path.
  await db.executeQuery(
    sql`CREATE INDEX IF NOT EXISTS idx_lemma_translations_lang
        ON lemma_translations (language_code)`.compile(db),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_lemma_translations_lang`.compile(db),
  );
  await db.schema.dropTable("lemma_translations").execute();
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_lemmas_loaded`.compile(db),
  );
  await db.schema.dropTable("lemmas").execute();
}
