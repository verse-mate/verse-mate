import type { RelatedWord } from "database/src/models/public/Lemmas";
import { sql } from "kysely";
import type { db } from "../../shared/shared.plugin";

/**
 * Merged lemma row returned from the DB after LEFT JOIN on
 * lemma_translations. Translated fields fall back to the English baseline
 * stored on `lemmas` when no translation exists for the requested
 * language (mirrors topic_translations: `translated_name || original_name`).
 */
export interface LemmaCard {
  strongs: string;
  lemma: string;
  translit: string | null;
  pronunciation: string | null;
  nt_frequency: number | null;
  ot_frequency: number | null;
  loaded: boolean;
  pos: string | null;
  basic_gloss: string | null;
  semantic_range: string[] | null;
  notes: string | null;
  related: RelatedWord[] | null;
  language_code: string;
  source: string | null;
  is_translated: boolean;
}

export class LemmaRepository {
  constructor(private readonly db: db) {}

  /**
   * Fetch one lemma card with optional per-language overrides.
   *
   * For `language_code === 'en'` (or omitted), returns the English baseline
   * on the `lemmas` row directly with `is_translated: false`. Web reads
   * English from the bundled `@versemate/lexicon` JSON so this path is
   * mostly for parity / mobile, but it stays consistent.
   *
   * For any other language, LEFT JOINs `lemma_translations` filtered on
   * the requested `language_code` and prefers the `translated_*` fields
   * when present, falling back to the English baseline field-by-field.
   *
   * Returns `null` if the strongs key isn't in `lemmas` at all.
   */
  async getLemma(
    strongs: string,
    languageCode = "en",
  ): Promise<LemmaCard | null> {
    const connection = this.db.getOrCreateConnection();

    const row = await connection
      .selectFrom("lemmas")
      .leftJoin("lemma_translations", (join) =>
        join
          .onRef("lemmas.strongs", "=", "lemma_translations.strongs")
          .on("lemma_translations.language_code", "=", sql.lit(languageCode))
          .on("lemma_translations.is_active", "=", true),
      )
      .where("lemmas.strongs", "=", strongs)
      .select([
        "lemmas.strongs",
        "lemmas.lemma",
        "lemmas.translit",
        "lemmas.pronunciation",
        "lemmas.nt_frequency",
        "lemmas.ot_frequency",
        "lemmas.loaded",
        "lemmas.pos as base_pos",
        "lemmas.basic_gloss as base_basic_gloss",
        "lemmas.semantic_range as base_semantic_range",
        "lemmas.notes as base_notes",
        "lemmas.related as base_related",
        "lemma_translations.translated_pos",
        "lemma_translations.translated_basic_gloss",
        "lemma_translations.translated_semantic_range",
        "lemma_translations.translated_notes",
        "lemma_translations.translated_related",
        "lemma_translations.source",
      ])
      .executeTakeFirst();

    if (!row) return null;

    const isTranslated = row.translated_basic_gloss != null;

    return {
      strongs: row.strongs,
      lemma: row.lemma,
      translit: row.translit,
      pronunciation: row.pronunciation,
      nt_frequency: row.nt_frequency,
      ot_frequency: row.ot_frequency,
      loaded: row.loaded,
      // Field-by-field fallback. A translation row might have some
      // fields populated and others null (e.g. notes translated but
      // semantic_range still empty) — preserve the English value where
      // the translation is missing, same as topic_translations.
      pos: row.translated_pos ?? row.base_pos,
      basic_gloss: row.translated_basic_gloss ?? row.base_basic_gloss,
      semantic_range: row.translated_semantic_range ?? row.base_semantic_range,
      notes: row.translated_notes ?? row.base_notes,
      related: row.translated_related ?? row.base_related,
      language_code: isTranslated ? languageCode : "en",
      source: row.source,
      is_translated: isTranslated,
    };
  }
}
