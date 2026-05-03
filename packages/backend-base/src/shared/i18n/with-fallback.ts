/**
 * withEnglishFallback — wrap a content lookup so that when the user's language
 * has no row, the response falls back to English with a flag.
 *
 * Per spec feat-i18n br-i18n-004 (D-014): "When a chapter has no explanation
 * in the user's language, the API returns the English version with metadata
 * `{translated: false, source_language: 'en'}`. UI shows 'Showing English (no
 * translation available)'."
 *
 * The wrapper takes:
 *   - the user's requested language code
 *   - a `lookup(languageCode)` function that returns content or null
 * and returns `{ content, translated: boolean, source_language: string }`.
 *
 * Returns null only if BOTH user-language AND English have no content.
 */

import { canonicalizeLanguageCode } from "./resolve-language-code";

export interface FallbackResult<T> {
  content: T;
  /** True if the content matches the requested language. False if it fell back to English. */
  translated: boolean;
  /** The actual language of the returned content. */
  source_language: string;
}

const FALLBACK_LANGUAGE = "en";

export async function withEnglishFallback<T>(
  requestedLanguageCode: string,
  lookup: (languageCode: string) => Promise<T | null | undefined>,
): Promise<FallbackResult<T> | null> {
  // First try the requested language (alias-aware lookup is the responsibility of `lookup`).
  const direct = await lookup(requestedLanguageCode);
  if (direct) {
    return {
      content: direct,
      translated: true,
      source_language: canonicalizeLanguageCode(requestedLanguageCode),
    };
  }

  // Skip fallback if requested IS English (alias-aware comparison)
  const requestedBase = canonicalizeLanguageCode(requestedLanguageCode);
  if (requestedBase === FALLBACK_LANGUAGE) {
    return null;
  }

  // Fall back to English
  const fallback = await lookup(FALLBACK_LANGUAGE);
  if (fallback) {
    return {
      content: fallback,
      translated: false,
      source_language: FALLBACK_LANGUAGE,
    };
  }

  // Neither user-language nor English has content
  return null;
}
