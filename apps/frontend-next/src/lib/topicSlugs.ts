// Topic category slug mappings
export const TOPIC_CATEGORY_SLUGS: Record<string, string> = {
  EVENT: "events",
  PROPHECY: "prophecies",
  PARABLE: "parables",
  THEME: "themes",
};

// Reverse mapping: slug -> backend category
const SLUG_TO_CATEGORY: Record<string, string> = {
  events: "EVENT",
  prophecies: "PROPHECY",
  parables: "PARABLE",
  themes: "THEME",
};

export function getCategorySlug(category: string): string | null {
  return TOPIC_CATEGORY_SLUGS[category] ?? null;
}

export function getCategoryFromSlug(slug: string): string | null {
  return SLUG_TO_CATEGORY[slug] ?? null;
}

export function generateTopicSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}
