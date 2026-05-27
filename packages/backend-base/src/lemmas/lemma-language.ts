/**
 * Pure helpers shared by the `/lemma` endpoint and the coverage report.
 * No DB / service imports — kept side-effect free so they unit-test
 * without a database or env.
 */

/**
 * Normalize an incoming language code to the bare lowercase ISO 639 base
 * code that `lemma_translations.language_code` is keyed on for the LLM
 * pipeline (es, de, fr, ...).
 *
 * Strips a region/script suffix and lowercases, so `es-MX`, `ES`, `pt_BR`
 * and `zh-Hans` collapse to `es` / `pt` / `zh`. The web/mobile client
 * already strips the suffix before calling, but normalizing here as well
 * means a stray region code — or an authenticated user's stored
 * `preferred_language` that still carries one — matches the same row
 * instead of silently falling back to English.
 *
 * Anything that isn't a plausible 2-3 letter code collapses to `"en"`,
 * which keeps the value safe to inline as a SQL literal and routes the
 * lookup to the English baseline (there are no `en` rows in
 * `lemma_translations`).
 */
export function normalizeLanguageCode(raw: string | null | undefined): string {
  const base = (raw ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(base) ? base : "en";
}

/** Translatable prose fields on a lemma card (everything else is universal). */
export const LEMMA_PROSE_FIELDS = [
  "pos",
  "basic_gloss",
  "semantic_range",
  "notes",
  "related",
] as const;

export type LemmaProseField = (typeof LEMMA_PROSE_FIELDS)[number];

export type LemmaProseValues = Record<LemmaProseField, unknown>;

/**
 * A lemma card "reads as fully translated" only when every English prose
 * field present on the baseline has a non-null translation — i.e. no field
 * leaks back to English via the field-by-field fallback. Fields the
 * baseline itself lacks (null) impose no requirement.
 *
 * Callers MUST first confirm a translation row exists: with an all-null
 * baseline (a non-loaded lemma) every check passes vacuously, so this
 * returning `true` is only meaningful when paired with a row-presence
 * check.
 */
export function isLemmaFullyTranslated(
  base: LemmaProseValues,
  translated: LemmaProseValues,
): boolean {
  return LEMMA_PROSE_FIELDS.every(
    (field) => base[field] == null || translated[field] != null,
  );
}
