/**
 * Seed the Verse-of-the-Day curation pool + tag vocabulary (GH-265,
 * migration 20260608000000).
 *
 * Two phases:
 *   1. Upsert the controlled-vocabulary tags (idempotent on slug).
 *   2. Insert the curated verse pool, resolving book NAME → books.book_id and
 *      validating each reference exists in the NASB1995 baseline.
 *
 * IMPORTANT — content coverage: verse *content* is loaded incrementally
 * (the product started with Genesis + Matthew). A curated reference whose
 * verses aren't yet present in NASB1995 is SKIPPED with a warning rather than
 * aborting the whole seed, so the pool always reflects what's actually
 * renderable. Re-running later picks up references once their book loads.
 *
 * Idempotent: a verse already present (same book/chapter/verse range) is
 * skipped; tags upsert on slug.
 *
 *   bun src/actions/seed-daily-verses.ts
 */
import { db } from "../database";

const DEFAULT_VERSION_KEY = "NASB1995";

// Controlled vocabulary (D-27). v1 leans encouraging; heavier themes
// (lament, judgment) can be added later without a redesign.
const TAGS: { slug: string; label: string }[] = [
  { slug: "encouraging", label: "Encouraging" },
  { slug: "hope", label: "Hope" },
  { slug: "wisdom", label: "Wisdom" },
  { slug: "comfort", label: "Comfort" },
  { slug: "courage", label: "Courage" },
  { slug: "peace", label: "Peace" },
  { slug: "joy", label: "Joy" },
  { slug: "gratitude", label: "Gratitude" },
  { slug: "faith", label: "Faith" },
  { slug: "love", label: "Love" },
  { slug: "prayer", label: "Prayer" },
];

interface SeedVerse {
  book: string; // canonical books.name
  chapter: number;
  start: number;
  end?: number;
  tags: string[];
}

// Curated starter pool (~90). Weighted toward Genesis + Matthew (guaranteed
// content) plus widely-loved encouraging passages elsewhere that seed in once
// their book has content. Keep additions encouraging for v1.
const VERSES: SeedVerse[] = [
  // Genesis
  { book: "Genesis", chapter: 1, start: 1, tags: ["wisdom", "faith"] },
  { book: "Genesis", chapter: 1, start: 27, tags: ["love", "hope"] },
  { book: "Genesis", chapter: 1, start: 31, tags: ["joy", "gratitude"] },
  { book: "Genesis", chapter: 2, start: 2, end: 3, tags: ["peace", "gratitude"] },
  { book: "Genesis", chapter: 9, start: 13, tags: ["hope", "faith"] },
  { book: "Genesis", chapter: 12, start: 2, tags: ["hope", "faith"] },
  { book: "Genesis", chapter: 15, start: 1, tags: ["courage", "faith"] },
  { book: "Genesis", chapter: 28, start: 15, tags: ["comfort", "faith"] },
  { book: "Genesis", chapter: 50, start: 20, tags: ["hope", "encouraging"] },
  // Matthew
  { book: "Matthew", chapter: 5, start: 3, end: 4, tags: ["comfort", "hope"] },
  { book: "Matthew", chapter: 5, start: 6, tags: ["hope", "encouraging"] },
  { book: "Matthew", chapter: 5, start: 9, tags: ["peace"] },
  { book: "Matthew", chapter: 5, start: 14, end: 16, tags: ["courage", "encouraging"] },
  { book: "Matthew", chapter: 6, start: 26, tags: ["comfort", "faith"] },
  { book: "Matthew", chapter: 6, start: 33, tags: ["faith", "wisdom"] },
  { book: "Matthew", chapter: 6, start: 34, tags: ["peace", "comfort"] },
  { book: "Matthew", chapter: 7, start: 7, tags: ["prayer", "faith"] },
  { book: "Matthew", chapter: 7, start: 11, tags: ["love", "prayer"] },
  { book: "Matthew", chapter: 11, start: 28, end: 30, tags: ["comfort", "peace"] },
  { book: "Matthew", chapter: 19, start: 26, tags: ["faith", "hope"] },
  { book: "Matthew", chapter: 22, start: 37, end: 39, tags: ["love"] },
  { book: "Matthew", chapter: 28, start: 20, tags: ["comfort", "courage"] },
  // Psalms
  { book: "Psalms", chapter: 23, start: 1, end: 3, tags: ["comfort", "peace"] },
  { book: "Psalms", chapter: 23, start: 4, tags: ["courage", "comfort"] },
  { book: "Psalms", chapter: 27, start: 1, tags: ["courage", "faith"] },
  { book: "Psalms", chapter: 28, start: 7, tags: ["joy", "faith"] },
  { book: "Psalms", chapter: 30, start: 5, tags: ["hope", "joy"] },
  { book: "Psalms", chapter: 34, start: 8, tags: ["faith", "joy"] },
  { book: "Psalms", chapter: 34, start: 18, tags: ["comfort"] },
  { book: "Psalms", chapter: 37, start: 4, tags: ["joy", "faith"] },
  { book: "Psalms", chapter: 46, start: 1, tags: ["comfort", "courage"] },
  { book: "Psalms", chapter: 46, start: 10, tags: ["peace"] },
  { book: "Psalms", chapter: 55, start: 22, tags: ["comfort", "faith"] },
  { book: "Psalms", chapter: 91, start: 1, end: 2, tags: ["comfort", "peace"] },
  { book: "Psalms", chapter: 103, start: 2, end: 4, tags: ["gratitude"] },
  { book: "Psalms", chapter: 118, start: 24, tags: ["joy", "gratitude"] },
  { book: "Psalms", chapter: 119, start: 105, tags: ["wisdom"] },
  { book: "Psalms", chapter: 121, start: 1, end: 2, tags: ["comfort", "faith"] },
  { book: "Psalms", chapter: 139, start: 14, tags: ["gratitude", "hope"] },
  { book: "Psalms", chapter: 143, start: 8, tags: ["hope", "prayer"] },
  // Proverbs
  { book: "Proverbs", chapter: 3, start: 5, end: 6, tags: ["wisdom", "faith"] },
  { book: "Proverbs", chapter: 16, start: 3, tags: ["wisdom", "faith"] },
  { book: "Proverbs", chapter: 18, start: 10, tags: ["courage", "comfort"] },
  // Isaiah
  { book: "Isaiah", chapter: 26, start: 3, tags: ["peace", "faith"] },
  { book: "Isaiah", chapter: 40, start: 29, tags: ["comfort", "courage"] },
  { book: "Isaiah", chapter: 40, start: 31, tags: ["hope", "courage"] },
  { book: "Isaiah", chapter: 41, start: 10, tags: ["courage", "comfort"] },
  { book: "Isaiah", chapter: 43, start: 2, tags: ["courage", "faith"] },
  { book: "Isaiah", chapter: 41, start: 13, tags: ["comfort", "courage"] },
  // Jeremiah
  { book: "Jeremiah", chapter: 29, start: 11, tags: ["hope", "encouraging"] },
  { book: "Jeremiah", chapter: 33, start: 3, tags: ["prayer", "hope"] },
  // Lamentations
  { book: "Lamentations", chapter: 3, start: 22, end: 23, tags: ["hope", "comfort"] },
  // Joshua
  { book: "Joshua", chapter: 1, start: 9, tags: ["courage", "faith"] },
  // Deuteronomy
  { book: "Deuteronomy", chapter: 31, start: 6, tags: ["courage", "comfort"] },
  // John
  { book: "John", chapter: 3, start: 16, tags: ["love", "hope"] },
  { book: "John", chapter: 14, start: 1, tags: ["peace", "comfort"] },
  { book: "John", chapter: 14, start: 27, tags: ["peace", "comfort"] },
  { book: "John", chapter: 16, start: 33, tags: ["courage", "peace"] },
  // Romans
  { book: "Romans", chapter: 5, start: 3, end: 4, tags: ["hope", "encouraging"] },
  { book: "Romans", chapter: 8, start: 28, tags: ["hope", "faith"] },
  { book: "Romans", chapter: 8, start: 38, end: 39, tags: ["love", "comfort"] },
  { book: "Romans", chapter: 12, start: 12, tags: ["hope", "prayer"] },
  { book: "Romans", chapter: 15, start: 13, tags: ["hope", "joy", "peace"] },
  // 1 Corinthians
  { book: "1 Corinthians", chapter: 13, start: 4, end: 7, tags: ["love"] },
  { book: "1 Corinthians", chapter: 16, start: 14, tags: ["love"] },
  // 2 Corinthians
  { book: "2 Corinthians", chapter: 4, start: 16, end: 18, tags: ["hope", "courage"] },
  { book: "2 Corinthians", chapter: 5, start: 7, tags: ["faith"] },
  { book: "2 Corinthians", chapter: 12, start: 9, tags: ["comfort", "faith"] },
  // Galatians
  { book: "Galatians", chapter: 5, start: 22, end: 23, tags: ["love", "joy", "peace"] },
  { book: "Galatians", chapter: 6, start: 9, tags: ["encouraging", "hope"] },
  // Ephesians
  { book: "Ephesians", chapter: 2, start: 8, end: 9, tags: ["faith", "gratitude"] },
  { book: "Ephesians", chapter: 3, start: 20, tags: ["faith", "hope"] },
  // Philippians
  { book: "Philippians", chapter: 4, start: 6, end: 7, tags: ["peace", "prayer"] },
  { book: "Philippians", chapter: 4, start: 8, tags: ["wisdom", "peace"] },
  { book: "Philippians", chapter: 4, start: 13, tags: ["courage", "faith"] },
  { book: "Philippians", chapter: 4, start: 19, tags: ["comfort", "faith"] },
  // Colossians
  { book: "Colossians", chapter: 3, start: 15, tags: ["peace", "gratitude"] },
  { book: "Colossians", chapter: 3, start: 23, tags: ["encouraging", "wisdom"] },
  // 1 Thessalonians
  { book: "1 Thessalonians", chapter: 5, start: 16, end: 18, tags: ["joy", "gratitude", "prayer"] },
  // 2 Timothy
  { book: "2 Timothy", chapter: 1, start: 7, tags: ["courage"] },
  // Hebrews
  { book: "Hebrews", chapter: 11, start: 1, tags: ["faith", "hope"] },
  { book: "Hebrews", chapter: 12, start: 1, end: 2, tags: ["courage", "faith"] },
  { book: "Hebrews", chapter: 13, start: 5, end: 6, tags: ["comfort", "courage"] },
  { book: "Hebrews", chapter: 13, start: 8, tags: ["faith", "comfort"] },
  // James
  { book: "James", chapter: 1, start: 2, end: 3, tags: ["joy", "hope"] },
  { book: "James", chapter: 1, start: 5, tags: ["wisdom", "prayer"] },
  // 1 Peter
  { book: "1 Peter", chapter: 5, start: 7, tags: ["comfort", "peace"] },
  // 1 John
  { book: "1 John", chapter: 4, start: 18, tags: ["love", "courage"] },
  { book: "1 John", chapter: 4, start: 19, tags: ["love", "gratitude"] },
  // Revelation
  { book: "Revelation", chapter: 21, start: 4, tags: ["hope", "comfort"] },
  // Nehemiah
  { book: "Nehemiah", chapter: 8, start: 10, tags: ["joy", "courage"] },
  // Zephaniah
  { book: "Zephaniah", chapter: 3, start: 17, tags: ["love", "joy"] },
  // Numbers
  { book: "Numbers", chapter: 6, start: 24, end: 26, tags: ["peace", "comfort"] },
];

async function main() {
  const conn = db.getOrCreateConnection();

  // Phase 1 — tags (idempotent on slug).
  for (const tag of TAGS) {
    await conn
      .insertInto("daily_verse_tags")
      .values({ slug: tag.slug, label: tag.label, is_active: true })
      .onConflict((oc) =>
        oc.column("slug").doUpdateSet({ label: tag.label, updated_at: new Date() }),
      )
      .execute();
  }
  const tagRows = await conn
    .selectFrom("daily_verse_tags")
    .select(["id", "slug"])
    .execute();
  const tagIdBySlug = new Map(tagRows.map((r) => [r.slug, r.id]));
  console.log(`Tags upserted: ${tagRows.length}`);

  // Resolve NASB1995 version id for baseline validation.
  const baseline = await conn
    .selectFrom("bible_versions")
    .where("version_key", "=", DEFAULT_VERSION_KEY)
    .select("id")
    .executeTakeFirst();
  if (!baseline) {
    console.error(`Baseline version ${DEFAULT_VERSION_KEY} not found. Aborting.`);
    await db.closeConnection();
    process.exit(1);
  }

  let inserted = 0;
  let skippedExisting = 0;
  let skippedNoContent = 0;
  let skippedNoBook = 0;

  for (const v of VERSES) {
    const end = v.end ?? v.start;

    const book = await conn
      .selectFrom("books")
      .where("name", "=", v.book)
      .select("book_id")
      .executeTakeFirst();
    if (!book) {
      skippedNoBook++;
      console.warn(`  skip (no book): ${v.book} ${v.chapter}:${v.start}`);
      continue;
    }

    const chapter = await conn
      .selectFrom("chapters")
      .where("book_id", "=", book.book_id)
      .where("chapter_number", "=", v.chapter)
      .select("chapter_id")
      .executeTakeFirst();
    if (!chapter) {
      skippedNoContent++;
      console.warn(`  skip (no chapter): ${v.book} ${v.chapter}:${v.start}`);
      continue;
    }

    // Validate every verse in the range exists in the NASB1995 baseline (D-29).
    const present = await conn
      .selectFrom("verses")
      .where("chapter_id", "=", chapter.chapter_id)
      .where("version_id", "=", baseline.id)
      .where("verse_number", ">=", v.start)
      .where("verse_number", "<=", end)
      .select("verse_number")
      .execute();
    const presentNums = new Set(present.map((r) => r.verse_number));
    let complete = true;
    for (let n = v.start; n <= end; n++) {
      if (!presentNums.has(n)) {
        complete = false;
        break;
      }
    }
    if (!complete) {
      skippedNoContent++;
      console.warn(
        `  skip (no NASB content): ${v.book} ${v.chapter}:${v.start}${v.end ? `-${v.end}` : ""}`,
      );
      continue;
    }

    // Idempotency: skip if an identical reference already exists.
    const existing = await conn
      .selectFrom("daily_verses")
      .where("book_id", "=", book.book_id)
      .where("chapter_number", "=", v.chapter)
      .where("verse_start", "=", v.start)
      .where("verse_end", v.end ? "=" : "is", v.end ?? null)
      .select("id")
      .executeTakeFirst();
    if (existing) {
      skippedExisting++;
      continue;
    }

    const verse = await conn
      .insertInto("daily_verses")
      .values({
        book_id: book.book_id,
        chapter_number: v.chapter,
        verse_start: v.start,
        verse_end: v.end ?? null,
        is_active: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const tagIds = v.tags
      .map((slug) => tagIdBySlug.get(slug))
      .filter((id): id is string => Boolean(id));
    if (tagIds.length > 0) {
      await conn
        .insertInto("daily_verse_to_tag")
        .values(tagIds.map((tag_id) => ({ daily_verse_id: verse.id, tag_id })))
        .execute();
    }
    inserted++;
  }

  console.log(
    `Daily verses seeded — inserted: ${inserted}, already present: ${skippedExisting}, skipped (no content): ${skippedNoContent}, skipped (no book): ${skippedNoBook}. Pool definition size: ${VERSES.length}.`,
  );
  await db.closeConnection();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
