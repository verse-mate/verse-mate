import type { RelatedWord } from "database/src/models/public/Lemmas";
import { sql } from "kysely";
import type { db } from "../../shared/shared.plugin";
import {
  isLemmaFullyTranslated,
  normalizeLanguageCode,
} from "../lemma-language";

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

    // Match on the bare lowercase ISO base code the translation rows are
    // keyed on (es, de, ...). Without this an `es-MX` / `ES` request misses
    // every `es` row and silently falls back to English. The normalized
    // value is also guaranteed `^[a-z]{2,3}$` (or "en"), so it stays safe
    // to inline as the `sql.lit` literal below.
    const lang = normalizeLanguageCode(languageCode);

    const row = await connection
      .selectFrom("lemmas")
      .leftJoin("lemma_translations", (join) =>
        join
          .onRef("lemmas.strongs", "=", "lemma_translations.strongs")
          .on("lemma_translations.language_code", "=", sql.lit(lang))
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
        "lemma_translations.translation_id",
        "lemma_translations.translated_pos",
        "lemma_translations.translated_basic_gloss",
        "lemma_translations.translated_semantic_range",
        "lemma_translations.translated_notes",
        "lemma_translations.translated_related",
        "lemma_translations.source",
      ])
      .executeTakeFirst();

    if (!row) return null;

    // A translation row exists for this language. `translation_id` is
    // non-nullable on the row, so it reliably distinguishes "row present
    // but some fields null" from "no row at all".
    const hasTranslationRow = row.translation_id != null;

    // `is_translated` means "this card reads as translated" — true only
    // when the row covers every English prose field present on the
    // baseline, so the "Translated" badge never shows over English prose
    // leaked in via the field-by-field fallback below.
    const isTranslated =
      hasTranslationRow &&
      isLemmaFullyTranslated(
        {
          pos: row.base_pos,
          basic_gloss: row.base_basic_gloss,
          semantic_range: row.base_semantic_range,
          notes: row.base_notes,
          related: row.base_related,
        },
        {
          pos: row.translated_pos,
          basic_gloss: row.translated_basic_gloss,
          semantic_range: row.translated_semantic_range,
          notes: row.translated_notes,
          related: row.translated_related,
        },
      );

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
      // Which language's data the payload represents. Equals the requested
      // (normalized) code whenever a translation row exists — even a
      // partial one — else "en". `is_translated` separately signals whether
      // that row is complete.
      language_code: hasTranslationRow ? lang : "en",
      source: row.source,
      is_translated: isTranslated,
    };
  }
}
