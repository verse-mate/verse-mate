import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Generate URL-friendly slug from topic title
 * Matches frontend algorithm in packages/frontend-base/src/utils/topicSlugs.ts
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding slug column to topics table...");

  // 1. Add slug column (nullable initially)
  await db.schema
    .alterTable("topics")
    .addColumn("slug", "varchar(255)")
    .execute();

  console.log("Slug column added. Populating slugs for existing topics...");

  // 2. Populate slugs for existing topics
  const topics = await db
    .selectFrom("topics")
    .selectAll()
    .orderBy("category")
    .orderBy("sort_order")
    .orderBy("name")
    .execute();

  const slugsPerCategory = new Map<string, Set<string>>();

  for (const topic of topics) {
    const baseSlug = generateSlug(topic.name);
    const category = topic.category;

    // Initialize category set if it doesn't exist
    if (!slugsPerCategory.has(category)) {
      slugsPerCategory.set(category, new Set());
    }

    // Generate unique slug within category
    let slug = baseSlug;
    let counter = 2;
    while (slugsPerCategory.get(category)?.has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Track this slug
    slugsPerCategory.get(category)?.add(slug);

    // Update topic with generated slug
    await db
      .updateTable("topics")
      .set({ slug })
      .where("topic_id", "=", topic.topic_id)
      .execute();
  }

  console.log(`Populated ${topics.length} topic slugs.`);

  // 3. Make slug NOT NULL
  await db.executeQuery(
    sql`ALTER TABLE topics ALTER COLUMN slug SET NOT NULL`.compile(db),
  );

  console.log("Set slug column to NOT NULL.");

  // 4. Add unique constraint (category + slug)
  await db.schema
    .alterTable("topics")
    .addUniqueConstraint("topics_category_slug_unique", ["category", "slug"])
    .execute();

  console.log("Added unique constraint on (category, slug).");

  // 5. Add index for fast lookups
  await db.schema
    .createIndex("topics_category_slug_idx")
    .on("topics")
    .columns(["category", "slug"])
    .execute();

  console.log("Added index on (category, slug).");
  console.log("Successfully added slug column to topics table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Removing slug column from topics table...");

  await db.schema.dropIndex("topics_category_slug_idx").ifExists().execute();

  await db.schema
    .alterTable("topics")
    .dropConstraint("topics_category_slug_unique")
    .ifExists()
    .execute();

  await db.schema.alterTable("topics").dropColumn("slug").execute();

  console.log("Successfully removed slug column from topics table.");
}
