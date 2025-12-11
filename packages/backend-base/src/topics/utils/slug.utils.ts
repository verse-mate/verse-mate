/**
 * Slug utility functions for topics
 * Matches frontend algorithm in packages/frontend-base/src/utils/topicSlugs.ts
 */

/**
 * Generate URL-friendly slug from topic title
 * Matches frontend algorithm in packages/frontend-base/src/utils/topicSlugs.ts
 *
 * @example
 * generateTopicSlug("The Resurrection") → "the-resurrection"
 * generateTopicSlug("God's Love") → "gods-love"
 * generateTopicSlug("  Extra  Spaces  ") → "extra-spaces"
 */
export function generateTopicSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Category slug mappings (URL → Backend)
 * URL slugs are plural and lowercase (events, prophecies, parables, themes)
 * Backend categories are singular and uppercase (EVENT, PROPHECY, PARABLE, THEME)
 */
const CATEGORY_SLUG_MAP: Record<string, string> = {
  events: "EVENT",
  prophecies: "PROPHECY",
  parables: "PARABLE",
  themes: "THEME",
};

/**
 * Reverse mapping (Backend → URL)
 */
const CATEGORY_TO_SLUG_MAP: Record<string, string> = {
  EVENT: "events",
  PROPHECY: "prophecies",
  PARABLE: "parables",
  THEME: "themes",
  // Legacy plural formats (for backward compatibility)
  EVENTS: "events",
  PROPHECIES: "prophecies",
  PARABLES: "parables",
  THEMES: "themes",
};

/**
 * Convert URL category slug to backend category format
 *
 * @example
 * getCategoryFromSlug("events") → "EVENT"
 * getCategoryFromSlug("prophecies") → "PROPHECY"
 * getCategoryFromSlug("invalid") → null
 */
export function getCategoryFromSlug(categorySlug: string): string | null {
  return CATEGORY_SLUG_MAP[categorySlug.toLowerCase()] || null;
}

/**
 * Convert backend category to URL slug format
 *
 * @example
 * getCategorySlug("EVENT") → "events"
 * getCategorySlug("PROPHECY") → "prophecies"
 */
export function getCategorySlug(category: string): string | null {
  return CATEGORY_TO_SLUG_MAP[category.toUpperCase()] || null;
}

/**
 * Generate unique slug within category by appending number suffix
 * Used when creating/updating topics to avoid slug conflicts
 *
 * @example
 * generateUniqueSlug("resurrection", "EVENT", ["resurrection"]) → "resurrection-2"
 * generateUniqueSlug("resurrection", "EVENT", ["resurrection", "resurrection-2"]) → "resurrection-3"
 */
export function generateUniqueSlug(
  baseSlug: string,
  _category: string,
  existingSlugs: string[],
): string {
  const slugSet = new Set(existingSlugs);

  // If base slug is available, use it
  if (!slugSet.has(baseSlug)) {
    return baseSlug;
  }

  // Otherwise, append number suffix starting from 2
  let counter = 2;
  let uniqueSlug = `${baseSlug}-${counter}`;

  while (slugSet.has(uniqueSlug)) {
    counter++;
    uniqueSlug = `${baseSlug}-${counter}`;
  }

  return uniqueSlug;
}
