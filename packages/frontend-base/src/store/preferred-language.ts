import { atom } from "nanostores";

const STORAGE_KEY = "versemate-preferred-language";
// "automatic" means "let the server decide" (signed-in user's saved preference
// or the bible version's language), matching the Settings picker's default.
const DEFAULT_LANGUAGE = "automatic";

function loadPreferredLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // localStorage not available (e.g. during SSR)
  }
  return DEFAULT_LANGUAGE;
}

export const preferredLanguageStore = atom<string>(loadPreferredLanguage());

export function setPreferredLanguage(language: string) {
  const value = language || DEFAULT_LANGUAGE;
  preferredLanguageStore.set(value);
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage not available
  }
}

/**
 * Collapse a stored selection to the base ISO 639-1 code the explanation
 * endpoint expects (e.g. "pt-BR" → "pt"), or `undefined` when no explicit
 * language is chosen so the request falls back to server-side resolution.
 */
export function resolveExplanationLang(language: string): string | undefined {
  if (!language || language === DEFAULT_LANGUAGE) {
    return undefined;
  }
  return language.split("-")[0].toLowerCase();
}

export { DEFAULT_LANGUAGE };
