import { db } from "./database";

/**
 * Generate URL-friendly slug from topic title
 * Matches frontend algorithm in packages/frontend-base/src/utils/topicSlugs.ts
 */
function generateTopicSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Seed the 20 theme topics
 * This script can be run independently to add theme topics without affecting existing data
 */
async function seedThemeTopics() {
  console.log("Starting theme topics seed...");

  // Check if theme topics already exist
  const existingThemeTopics = await db
    .getOrCreateConnection()
    .selectFrom("topics")
    .select("topic_id")
    .where("category", "=", "THEME")
    .execute();

  if (existingThemeTopics.length > 0) {
    console.log(
      `Found ${existingThemeTopics.length} existing THEME topics. Skipping seed.`,
    );
    return;
  }

  // 20 theme topics in alphabetical order
  const themeTopics = [
    {
      name: "Faith",
      description: "Trust and confidence in God",
      category: "THEME",
      sort_order: 1,
      is_active: true,
    },
    {
      name: "Family",
      description: "Biblical teachings on family relationships",
      category: "THEME",
      sort_order: 2,
      is_active: true,
    },
    {
      name: "Fear",
      description: "Overcoming fear through faith in God",
      category: "THEME",
      sort_order: 3,
      is_active: true,
    },
    {
      name: "Forgiveness",
      description: "God's forgiveness and forgiving others",
      category: "THEME",
      sort_order: 4,
      is_active: true,
    },
    {
      name: "Gratitude",
      description: "Thankfulness and appreciation to God",
      category: "THEME",
      sort_order: 5,
      is_active: true,
    },
    {
      name: "Grief",
      description: "Comfort and hope in times of loss",
      category: "THEME",
      sort_order: 6,
      is_active: true,
    },
    {
      name: "Healing",
      description: "Physical and spiritual healing",
      category: "THEME",
      sort_order: 7,
      is_active: true,
    },
    {
      name: "Hope",
      description: "Biblical hope and assurance in God's promises",
      category: "THEME",
      sort_order: 8,
      is_active: true,
    },
    {
      name: "Justice",
      description: "God's justice and righteousness",
      category: "THEME",
      sort_order: 9,
      is_active: true,
    },
    {
      name: "Love",
      description: "God's love and loving others",
      category: "THEME",
      sort_order: 10,
      is_active: true,
    },
    {
      name: "Marriage",
      description: "Biblical principles for marriage",
      category: "THEME",
      sort_order: 11,
      is_active: true,
    },
    {
      name: "Peace",
      description: "Inner peace through relationship with God",
      category: "THEME",
      sort_order: 12,
      is_active: true,
    },
    {
      name: "Prayer",
      description: "Communication with God through prayer",
      category: "THEME",
      sort_order: 13,
      is_active: true,
    },
    {
      name: "Provision",
      description: "God's provision and care",
      category: "THEME",
      sort_order: 14,
      is_active: true,
    },
    {
      name: "Purpose",
      description: "Finding purpose and meaning in God's plan",
      category: "THEME",
      sort_order: 15,
      is_active: true,
    },
    {
      name: "Salvation",
      description: "Redemption and eternal life through Christ",
      category: "THEME",
      sort_order: 16,
      is_active: true,
    },
    {
      name: "Strength",
      description: "Finding strength in God",
      category: "THEME",
      sort_order: 17,
      is_active: true,
    },
    {
      name: "Temptation",
      description: "Resisting temptation and living righteously",
      category: "THEME",
      sort_order: 18,
      is_active: true,
    },
    {
      name: "Trials",
      description: "Enduring hardship and growing through difficulties",
      category: "THEME",
      sort_order: 19,
      is_active: true,
    },
    {
      name: "Wisdom",
      description: "Godly wisdom and discernment",
      category: "THEME",
      sort_order: 20,
      is_active: true,
    },
  ];

  console.log(`Inserting ${themeTopics.length} theme topics...`);

  // Insert theme topics
  for (const topic of themeTopics) {
    const slug = generateTopicSlug(topic.name);
    await db
      .getOrCreateConnection()
      .insertInto("topics")
      .values({ ...topic, slug })
      .execute();
    console.log(`  ✓ Inserted: ${topic.name}`);
  }

  console.log("Theme topics seeded successfully!");
}

// Run the seed
seedThemeTopics()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error seeding theme topics:", error);
    process.exit(1);
  });
