/**
 * Formats language display name based on the design specification:
 * - For English variants (en, en-US, en-GB, etc.): Display only the native name to avoid redundancy
 * - For non-English languages: Display both native and English names separated by an em dash (—)
 *
 * @param language - Language object with code, name, and nativeName properties
 * @returns Formatted display string for the language
 */
export const formatLanguageDisplay = (language: {
  code: string;
  name: string;
  nativeName: string;
}): string => {
  // For English variants, display only the native name to avoid redundancy
  if (language.code.startsWith("en")) {
    return language.nativeName;
  }

  // For non-English languages, display both native and English names with an em dash
  return `${language.nativeName} — ${language.name}`;
};
