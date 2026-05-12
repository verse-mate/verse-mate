/**
 * resolveLanguageCode — alias resolver for BCP-47 language tags.
 *
 * Per spec feat-i18n br-i18n (D-013): backend treats `en` and `en-US` as
 * equivalent in lookups. Same for any future language with a base + region
 * variant. When looking up content, the alias resolver returns BOTH possible
 * keys so a single query can match either form.
 *
 * Storage layer is free to canonicalize on write (e.g. always store `en`),
 * but lookups must handle both inputs gracefully.
 *
 * Examples:
 *   resolveLanguageCode('en-US')  → ['en-US', 'en']    // try region first, fall back to base
 *   resolveLanguageCode('en')     → ['en', 'en-US']    // try base first, also match region
 *   resolveLanguageCode('pt-BR')  → ['pt-BR', 'pt']
 *   resolveLanguageCode('pt')     → ['pt', 'pt-BR']
 *   resolveLanguageCode('zh')     → ['zh']             // no canonical region variant
 *
 * The most-specific form is returned first so callers using `IN (...)` queries
 * naturally prefer the more specific match if both exist.
 */

/** Default region for each base language code where multiple regions might exist. */
const DEFAULT_REGIONS: Record<string, string> = {
  en: "US",
  pt: "BR",
  // Add more as needed (zh, fr, es) — currently mobile sends en-US only.
};

const BCP47_REGEX = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * Resolves a language code into the list of equivalent forms to look up.
 *
 * @param input — BCP-47 tag (e.g. "en", "en-US")
 * @returns ordered array of forms, most-specific first
 * @throws if input is not BCP-47 compatible
 */
export function resolveLanguageCode(input: string): string[] {
  if (!BCP47_REGEX.test(input)) {
    throw new Error(
      `Invalid language code "${input}". Expected BCP-47 format: "en" or "en-US".`,
    );
  }

  const hasRegion = input.includes("-");
  if (hasRegion) {
    // "en-US" → ["en-US", "en"]
    const base = input.split("-")[0];
    return [input, base];
  }

  // "en" → ["en", "en-US"] if there's a known default region
  const defaultRegion = DEFAULT_REGIONS[input];
  if (defaultRegion) {
    return [input, `${input}-${defaultRegion}`];
  }

  // "zh" → ["zh"] (no canonical region)
  return [input];
}

/**
 * Returns the canonical (storage-preferred) form: base language without region.
 * Backend writes use this. Lookups use resolveLanguageCode() to also accept
 * the regional form.
 */
export function canonicalizeLanguageCode(input: string): string {
  if (!BCP47_REGEX.test(input)) {
    throw new Error(
      `Invalid language code "${input}". Expected BCP-47 format: "en" or "en-US".`,
    );
  }
  return input.split("-")[0];
}
