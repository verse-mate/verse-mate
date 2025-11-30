/**
 * Strong's Concordance entry for Greek or Hebrew words
 */
export interface StrongsEntry {
  /** Strong's number (e.g., "G26" for Greek, "H430" for Hebrew) */
  id: string;

  /** Original word in Greek or Hebrew */
  lemma: string;

  /** Transliteration (pronunciation) */
  transliteration?: string;

  /** Part of speech (noun, verb, adjective, etc.) */
  partOfSpeech?: string;

  /** Short definition */
  definition: string;

  /** Extended definition with usage notes */
  extendedDefinition?: string;

  /** Derivation or etymology */
  derivation?: string;

  /** King James Version translation */
  kjvTranslation?: string;

  /** Usage count in scripture */
  usageCount?: number;
}

/**
 * Language type for Strong's numbers
 */
export type LanguageType = "greek" | "hebrew";

/**
 * Lexicon dictionary mapping Strong's numbers to entries
 */
export type LexiconDictionary = Record<string, StrongsEntry>;

/**
 * Result from a lexicon lookup
 */
export interface LookupResult {
  /** The Strong's entry if found */
  entry: StrongsEntry | null;

  /** Whether the lookup was successful */
  found: boolean;

  /** Error message if lookup failed */
  error?: string;
}
