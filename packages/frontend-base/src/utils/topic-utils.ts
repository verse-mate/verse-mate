import { getTopicsByCategory } from "../api/topics";

// Type for topic data
interface TopicData {
  topic_id: string;
  name: string;
  description?: string | null;
  sort_order: number | null;
  category?: string;
  is_translated?: boolean;
}

// Cache for topics by category
const topicCategoryCache = new Map<string, TopicData[]>();

/**
 * Map frontend category names to backend category names
 */
export function mapCategoryToBackend(
  frontendCategory: string,
): "EVENT" | "PROPHECY" | "PARABLE" | "THEME" {
  switch (frontendCategory) {
    case "EVENTS":
      return "EVENT";
    case "PROPHECIES":
      return "PROPHECY";
    case "PARABLES":
      return "PARABLE";
    case "THEMES":
      return "THEME";
    default:
      return frontendCategory as "EVENT" | "PROPHECY" | "PARABLE" | "THEME";
  }
}

/**
 * Map backend category names to frontend category names
 */
export function mapCategoryToFrontend(
  backendCategory: string,
): "EVENTS" | "PROPHECIES" | "PARABLES" | "THEMES" {
  switch (backendCategory) {
    case "EVENT":
      return "EVENTS";
    case "PROPHECY":
      return "PROPHECIES";
    case "PARABLE":
      return "PARABLES";
    case "THEME":
      return "THEMES";
    default:
      return backendCategory as "EVENTS" | "PROPHECIES" | "PARABLES" | "THEMES";
  }
}

/**
 * Fetch and cache all topics for a given category
 */
async function fetchTopicsForCategory(
  category: string,
  bibleVersion?: string,
): Promise<TopicData[]> {
  const cacheKey = `${category}-${bibleVersion || "default"}`;

  // Check cache first
  if (topicCategoryCache.has(cacheKey)) {
    return topicCategoryCache.get(cacheKey) || [];
  }

  try {
    const backendCategory = mapCategoryToBackend(category);
    const topics = await getTopicsByCategory(backendCategory, bibleVersion);

    if (topics && Array.isArray(topics)) {
      // Filter out topics without sort_order and sort by sort_order
      const sortedTopics = topics
        .filter((topic) => topic.sort_order !== null)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      topicCategoryCache.set(cacheKey, sortedTopics);
      return sortedTopics;
    }

    topicCategoryCache.set(cacheKey, []);
    return [];
  } catch (error) {
    console.error(`Error fetching topics for category ${category}:`, error);
    return [];
  }
}

/**
 * Get a topic by category and sort_order
 */
export async function getTopicBySortOrder(
  category: string,
  sortOrder: number,
  bibleVersion?: string,
): Promise<TopicData | null> {
  const topics = await fetchTopicsForCategory(category, bibleVersion);
  return topics.find((topic) => topic.sort_order === sortOrder) || null;
}

/**
 * Get the next topic in the same category
 * Returns null if there is no next topic
 */
export async function getNextTopic(
  category: string,
  currentSortOrder: number,
  bibleVersion?: string,
): Promise<TopicData | null> {
  const topics = await fetchTopicsForCategory(category, bibleVersion);

  // Find the next topic with a higher sort_order
  const nextTopic = topics.find(
    (topic) => (topic.sort_order || 0) > currentSortOrder,
  );

  return nextTopic || null;
}

/**
 * Get the previous topic in the same category
 * Returns null if there is no previous topic
 */
export async function getPreviousTopic(
  category: string,
  currentSortOrder: number,
  bibleVersion?: string,
): Promise<TopicData | null> {
  const topics = await fetchTopicsForCategory(category, bibleVersion);

  // Find the previous topic with a lower sort_order
  // We need to reverse search to get the closest one
  const previousTopics = topics.filter(
    (topic) => (topic.sort_order || 0) < currentSortOrder,
  );

  if (previousTopics.length === 0) {
    return null;
  }

  // Return the last one (highest sort_order that's still less than current)
  return previousTopics[previousTopics.length - 1];
}

/**
 * Get the total number of topics in a category
 */
export async function getTopicCount(
  category: string,
  bibleVersion?: string,
): Promise<number> {
  const topics = await fetchTopicsForCategory(category, bibleVersion);
  return topics.length;
}

/**
 * Clear the topic cache for a specific category or all categories
 */
export function clearTopicCache(
  category?: string,
  bibleVersion?: string,
): void {
  if (category) {
    const cacheKey = `${category}-${bibleVersion || "default"}`;
    topicCategoryCache.delete(cacheKey);
  } else {
    topicCategoryCache.clear();
  }
}

/**
 * Get topic ID from category and sort_order
 */
export async function getTopicId(
  category: string,
  sortOrder: number,
  bibleVersion?: string,
): Promise<string | null> {
  const topic = await getTopicBySortOrder(category, sortOrder, bibleVersion);
  return topic?.topic_id || null;
}
