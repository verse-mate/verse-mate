/**
 * Topic slug mapping for SEO-friendly URLs
 * Maps topic categories and entries to URL-friendly slugs
 * URL structure: /topic/{category-slug}/{entry-slug}
 * Example: /topic/events/the-resurrection
 */

/**
 * Static category slug mappings
 * Backend format (EVENT, PROPHECY, etc.) → URL slug (events, prophecies, etc.)
 */
export const TOPIC_CATEGORY_SLUGS: Record<string, string> = {
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
 * Reverse mapping: URL slug → frontend category
 */
export const SLUG_TO_TOPIC_CATEGORY: Record<string, string> = Object.entries(
  TOPIC_CATEGORY_SLUGS,
).reduce(
  (acc, [category, slug]) => {
    acc[slug] = category;
    return acc;
  },
  {} as Record<string, string>,
);

/**
 * Get the URL slug for a topic category
 * @param category - Frontend category (e.g., "EVENTS", "PROPHECIES")
 * @returns URL slug (e.g., "events", "prophecies") or null if invalid
 */
export function getCategorySlug(category: string): string | null {
  return TOPIC_CATEGORY_SLUGS[category.toUpperCase()] ?? null;
}

/**
 * Get the frontend category from a URL slug
 * @param slug - URL slug (e.g., "events", "prophecies")
 * @returns Frontend category (e.g., "EVENTS", "PROPHECIES") or null if invalid
 */
export function getCategoryFromSlug(slug: string): string | null {
  return SLUG_TO_TOPIC_CATEGORY[slug.toLowerCase()] ?? null;
}

/**
 * Check if a string is a valid topic category slug
 * @param slug - String to check
 * @returns true if valid category slug
 */
export function isValidCategorySlug(slug: string): boolean {
  return slug.toLowerCase() in SLUG_TO_TOPIC_CATEGORY;
}

/**
 * Generate a URL-friendly slug from a topic title
 * Converts "The Resurrection" → "the-resurrection"
 * @param title - Topic title
 * @returns URL slug
 */
export function generateTopicSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Parse and normalize a topic slug from URL
 * Ensures consistent formatting
 * @param slug - URL slug
 * @returns Normalized slug
 */
export function normalizeTopicSlug(slug: string): string {
  return slug.toLowerCase().trim();
}

/**
 * Build a complete topic URL path
 * @param category - Frontend category (e.g., "EVENTS")
 * @param topicTitle - Topic title (e.g., "The Resurrection")
 * @returns URL path (e.g., "/topic/events/the-resurrection")
 */
export function buildTopicUrl(category: string, topicTitle: string): string {
  const categorySlug = getCategorySlug(category);
  if (!categorySlug) {
    throw new Error(`Invalid topic category: ${category}`);
  }
  const topicSlug = generateTopicSlug(topicTitle);
  return `/topic/${categorySlug}/${topicSlug}`;
}

/**
 * Parse topic URL parameters
 * @param categorySlug - Category slug from URL (e.g., "events")
 * @param topicSlug - Topic slug from URL (e.g., "the-resurrection")
 * @returns Object with parsed category or null if invalid
 */
export function parseTopicUrl(
  categorySlug: string,
  topicSlug: string,
): { category: string; slug: string } | null {
  const category = getCategoryFromSlug(categorySlug);
  if (!category) {
    return null;
  }

  return {
    category,
    slug: normalizeTopicSlug(topicSlug),
  };
}
