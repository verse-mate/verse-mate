import { generateTopicSlug, getCategoryFromSlug } from "@/lib/topicSlugs";
import { notFound, redirect } from "next/navigation";

interface TopicPageProps {
  params: Promise<{
    category: string;
    slug: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Fetch topics from the API
async function getTopicsByCategory(
  category: string,
  bibleVersion = "NASB1995",
) {
  try {
    const baseUrl = process.env.API_URL || "https://api.versemate.org";
    const response = await fetch(
      `${baseUrl}/topics/search?category=${category}&bible_version=${bibleVersion}`,
      { cache: "no-store" },
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data?.topics || null;
  } catch (error) {
    console.error("Error fetching topics:", error);
    return null;
  }
}

export default async function TopicPage({
  params,
  searchParams,
}: TopicPageProps) {
  const { category: categorySlug, slug: topicSlug } = await params;
  const urlSearchParams = await searchParams;

  // Convert category slug to backend category (events -> EVENT)
  const backendCategory = getCategoryFromSlug(categorySlug);

  if (!backendCategory) {
    notFound();
  }

  // Get bible version from query params or use default
  const bibleVersion = (urlSearchParams.v ||
    urlSearchParams.bibleVersion ||
    "NASB1995") as string;

  // Fetch all topics for this category
  const topics = await getTopicsByCategory(backendCategory, bibleVersion);

  if (!topics || topics.length === 0) {
    notFound();
  }

  // Find the topic that matches the slug
  const topic = topics.find((t: any) => {
    const generatedSlug = generateTopicSlug(t.name);
    return generatedSlug === topicSlug;
  });

  if (!topic) {
    notFound();
  }

  // Build clean query params (only non-defaults like bible version)
  const query = new URLSearchParams();

  // Only add version if not default
  if (bibleVersion && bibleVersion !== "NASB1995") {
    query.set("v", bibleVersion);
  }

  // Check if we need to redirect to clean up old params
  const currentQuery = new URLSearchParams(
    urlSearchParams as Record<string, string>,
  );
  const hasOldParams =
    currentQuery.has("testament") ||
    currentQuery.has("bookId") ||
    currentQuery.has("verseId") ||
    currentQuery.has("bibleVersion") ||
    currentQuery.has("version") ||
    currentQuery.has("explanationType") ||
    currentQuery.has("type");

  if (hasOldParams && currentQuery.get("v") !== query.get("v")) {
    const queryString = query.toString();
    redirect(
      `/topic/${categorySlug}/${topicSlug}${queryString ? `?${queryString}` : ""}`,
    );
  }

  // Prepare topic data for context
  const topicData = {
    category: backendCategory,
    sortOrder: topic.sort_order,
    topicId: topic.topic_id,
    topicName: topic.name,
  };

  // Render with topic context provider
  const { TopicProvider } = await import("./components/TopicProvider");
  const { TopicContentWrapper } = await import(
    "./components/TopicContentWrapper"
  );

  return (
    <TopicProvider value={topicData}>
      <TopicContentWrapper />
    </TopicProvider>
  );
}
