import type { Kysely } from "kysely";
import type Database from "../models/Database";
import {
  JESUS_COLLECTIONS,
  JESUS_ENTRIES,
  JESUS_PERIODS,
  JESUS_THEMES,
  LIFE_TIMELINE,
  type SeedEntry,
} from "./data/jesus.data";

/**
 * Seed the Jesus feature from `data/jesus.data.ts`.
 *
 * Idempotent: every write is an upsert keyed on the natural slug, and an
 * entry's references / themes / collection memberships are replaced wholesale
 * rather than appended. Re-running after editing the data file converges the
 * database on the file, which is what makes the data file the source of truth.
 *
 * The seeder validates aggressively — an unknown book name, an unparseable
 * reference, or a timeline entry pointing at a slug that doesn't exist all
 * throw. A silent drop here would show up much later as a hole in the
 * chronology that nobody can explain.
 */

/** "Mark 4:35-41" → structured. Throws on anything it can't read. */
function parseReference(input: string): {
  book: string;
  chapter: number;
  verseStart: number | null;
  verseEnd: number | null;
} {
  const match = input
    .trim()
    .match(
      /^((?:[1-3]\s+)?[A-Za-z][A-Za-z\s.]*?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/,
    );

  if (!match) {
    throw new Error(`Unparseable scripture reference in seed data: "${input}"`);
  }

  const [, book, chapter, verseStart, verseEnd] = match;
  const start = verseStart ? Number.parseInt(verseStart, 10) : null;

  return {
    book: book.trim(),
    chapter: Number.parseInt(chapter, 10),
    verseStart: start,
    verseEnd: verseEnd ? Number.parseInt(verseEnd, 10) : start,
  };
}

export async function seedJesus(db: Kysely<Database>): Promise<void> {
  console.log("Seeding Jesus feature…");

  // ── Book name → id, resolved once ───────────────────────────────────────
  const books = await db
    .selectFrom("books")
    .select(["book_id", "name"])
    .execute();
  const bookIdByName = new Map(
    books.map((b) => [b.name.toLowerCase(), b.book_id]),
  );

  if (bookIdByName.size === 0) {
    throw new Error(
      "Cannot seed the Jesus feature: the books table is empty. Run the Bible seed first.",
    );
  }

  // ── Validate the whole corpus before writing anything ───────────────────
  const entryBySlug = new Map<string, SeedEntry>();
  for (const entry of JESUS_ENTRIES) {
    if (entryBySlug.has(entry.slug)) {
      throw new Error(`Duplicate entry slug in seed data: "${entry.slug}"`);
    }
    entryBySlug.set(entry.slug, entry);

    for (const ref of entry.refs) {
      const parsed = parseReference(ref);
      if (!bookIdByName.has(parsed.book.toLowerCase())) {
        throw new Error(
          `Unknown book "${parsed.book}" in reference "${ref}" (entry "${entry.slug}")`,
        );
      }
    }
  }

  const themeSlugs = new Set(JESUS_THEMES.map((t) => t.slug));
  for (const entry of JESUS_ENTRIES) {
    for (const theme of entry.themes) {
      if (!themeSlugs.has(theme)) {
        throw new Error(
          `Unknown theme "${theme}" on entry "${entry.slug}". Add it to JESUS_THEMES first.`,
        );
      }
    }
  }

  const periodSlugs = new Set(JESUS_PERIODS.map((p) => p.slug));
  for (const [periodSlug, slugs] of Object.entries(LIFE_TIMELINE)) {
    if (!periodSlugs.has(periodSlug)) {
      throw new Error(
        `LIFE_TIMELINE references unknown period "${periodSlug}"`,
      );
    }
    for (const slug of slugs) {
      if (!entryBySlug.has(slug)) {
        throw new Error(
          `LIFE_TIMELINE["${periodSlug}"] references unknown entry "${slug}"`,
        );
      }
    }
  }

  for (const collection of JESUS_COLLECTIONS) {
    if (collection.filter && collection.members) {
      throw new Error(
        `Collection "${collection.slug}" sets both filter and members; pick one.`,
      );
    }
    for (const slug of collection.members ?? []) {
      if (!entryBySlug.has(slug)) {
        throw new Error(
          `Collection "${collection.slug}" references unknown entry "${slug}"`,
        );
      }
    }
  }

  // ── Periods ─────────────────────────────────────────────────────────────
  const periodIdBySlug = new Map<string, string>();
  for (const [index, period] of JESUS_PERIODS.entries()) {
    const row = await db
      .insertInto("jesus_periods")
      .values({
        slug: period.slug,
        name: period.name,
        subtitle: period.subtitle,
        description: period.description,
        sort_order: index + 1,
        is_active: true,
      })
      .onConflict((oc) =>
        oc.column("slug").doUpdateSet({
          name: period.name,
          subtitle: period.subtitle,
          description: period.description,
          sort_order: index + 1,
          is_active: true,
          updated_at: new Date(),
        }),
      )
      .returning(["period_id"])
      .executeTakeFirstOrThrow();

    periodIdBySlug.set(period.slug, row.period_id);
  }
  console.log(`  · ${JESUS_PERIODS.length} periods`);

  // ── Themes ──────────────────────────────────────────────────────────────
  const themeIdBySlug = new Map<string, string>();
  for (const [index, theme] of JESUS_THEMES.entries()) {
    const row = await db
      .insertInto("jesus_themes")
      .values({
        slug: theme.slug,
        name: theme.name,
        description: theme.description,
        sort_order: index + 1,
        is_active: true,
      })
      .onConflict((oc) =>
        oc.column("slug").doUpdateSet({
          name: theme.name,
          description: theme.description,
          sort_order: index + 1,
          is_active: true,
          updated_at: new Date(),
        }),
      )
      .returning(["theme_id"])
      .executeTakeFirstOrThrow();

    themeIdBySlug.set(theme.slug, row.theme_id);
  }
  console.log(`  · ${JESUS_THEMES.length} themes`);

  // ── Timeline lookup: slug → { periodId, order } ─────────────────────────
  const timelinePlacement = new Map<
    string,
    { periodId: string; order: number }
  >();
  for (const [periodSlug, slugs] of Object.entries(LIFE_TIMELINE)) {
    const periodId = periodIdBySlug.get(periodSlug);
    if (!periodId) continue;
    slugs.forEach((slug, index) => {
      // An entry listed in two periods keeps its first placement — the
      // timeline is a single walk, so the earliest mention wins.
      if (!timelinePlacement.has(slug)) {
        timelinePlacement.set(slug, { periodId, order: index + 1 });
      }
    });
  }

  // ── Entries ─────────────────────────────────────────────────────────────
  const entryIdBySlug = new Map<string, string>();
  for (const [index, entry] of JESUS_ENTRIES.entries()) {
    const placement = timelinePlacement.get(entry.slug);

    const row = await db
      .insertInto("jesus_entries")
      .values({
        slug: entry.slug,
        kind: entry.kind,
        title: entry.title,
        summary: entry.summary,
        quote: entry.quote ?? null,
        quote_reference: entry.quoteRef ?? null,
        period_id: placement?.periodId ?? null,
        chronology_order: placement?.order ?? null,
        harmony_key: entry.harmony ?? null,
        sort_order: index + 1,
        is_active: true,
      })
      .onConflict((oc) =>
        oc.column("slug").doUpdateSet({
          kind: entry.kind,
          title: entry.title,
          summary: entry.summary,
          quote: entry.quote ?? null,
          quote_reference: entry.quoteRef ?? null,
          period_id: placement?.periodId ?? null,
          chronology_order: placement?.order ?? null,
          harmony_key: entry.harmony ?? null,
          sort_order: index + 1,
          is_active: true,
          updated_at: new Date(),
        }),
      )
      .returning(["entry_id"])
      .executeTakeFirstOrThrow();

    entryIdBySlug.set(entry.slug, row.entry_id);
  }

  // ── References and themes — replaced wholesale so edits converge ────────
  const entryIds = [...entryIdBySlug.values()];
  await db
    .deleteFrom("jesus_entry_references")
    .where("entry_id", "in", entryIds)
    .execute();
  await db
    .deleteFrom("jesus_entry_themes")
    .where("entry_id", "in", entryIds)
    .execute();

  const referenceRows = JESUS_ENTRIES.flatMap((entry) =>
    entry.refs.map((ref, refIndex) => {
      const parsed = parseReference(ref);
      return {
        entry_id: entryIdBySlug.get(entry.slug) as string,
        book_id: bookIdByName.get(parsed.book.toLowerCase()) as number,
        chapter: parsed.chapter,
        verse_start: parsed.verseStart,
        verse_end: parsed.verseEnd,
        // The first reference listed is the one the card leads with.
        is_primary: refIndex === 0,
        sort_order: refIndex,
      };
    }),
  );

  const themeRows = JESUS_ENTRIES.flatMap((entry) =>
    entry.themes.map((theme) => ({
      entry_id: entryIdBySlug.get(entry.slug) as string,
      theme_id: themeIdBySlug.get(theme) as string,
    })),
  );

  await insertInChunks(db, "jesus_entry_references", referenceRows);
  await insertInChunks(db, "jesus_entry_themes", themeRows);

  console.log(
    `  · ${JESUS_ENTRIES.length} entries, ${referenceRows.length} references, ${themeRows.length} theme links`,
  );

  // ── Collections ─────────────────────────────────────────────────────────
  for (const [index, collection] of JESUS_COLLECTIONS.entries()) {
    const row = await db
      .insertInto("jesus_collections")
      .values({
        slug: collection.slug,
        name: collection.name,
        subtitle: collection.subtitle,
        description: collection.description,
        filter: collection.filter ? JSON.stringify(collection.filter) : null,
        is_featured: collection.isFeatured,
        sort_order: index + 1,
        is_active: true,
      })
      .onConflict((oc) =>
        oc.column("slug").doUpdateSet({
          name: collection.name,
          subtitle: collection.subtitle,
          description: collection.description,
          filter: collection.filter ? JSON.stringify(collection.filter) : null,
          is_featured: collection.isFeatured,
          sort_order: index + 1,
          is_active: true,
          updated_at: new Date(),
        }),
      )
      .returning(["collection_id"])
      .executeTakeFirstOrThrow();

    await db
      .deleteFrom("jesus_collection_entries")
      .where("collection_id", "=", row.collection_id)
      .execute();

    const members = (collection.members ?? []).map((slug, memberIndex) => ({
      collection_id: row.collection_id,
      entry_id: entryIdBySlug.get(slug) as string,
      sort_order: memberIndex,
    }));

    await insertInChunks(db, "jesus_collection_entries", members);
  }
  console.log(`  · ${JESUS_COLLECTIONS.length} collections`);

  console.log("Jesus feature seeded.");
}

/**
 * Postgres caps a statement at 65535 bound parameters. Chunking keeps the seed
 * working as the corpus grows past that ceiling.
 */
async function insertInChunks<T extends keyof Database & string>(
  db: Kysely<Database>,
  table: T,
  // Rows are built and typed at each call site; this helper is deliberately
  // table-generic, so it can only see them as opaque records.
  rows: Record<string, unknown>[],
  chunkSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    await db
      .insertInto(table)
      .values(
        chunk as Parameters<ReturnType<typeof db.insertInto<T>>["values"]>[0],
      )
      .execute();
  }
}
