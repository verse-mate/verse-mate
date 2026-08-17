import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Move the shipped Jesus corpus onto the event graph.
 *
 * The previous model gave every row a single `kind` and grouped related rows
 * with a `harmony_key` string. That string was already doing the work of an
 * event without being one: 20 clusters held more than one entry for a single
 * episode, and the product rendered them as unrelated cards.
 *
 * Rules:
 *  - each distinct `harmony_key` becomes one event
 *  - each entry without a harmony key becomes its own single-account event
 *  - every entry becomes a facet on its event, keeping its slug so existing
 *    /jesus/entry/<slug> URLs still resolve
 *  - references, themes and timeline placement roll up to the event; the
 *    entry's own primary reference stays on the facet
 *
 * Provenance: migrated facets are recorded at level 2, not level 1. The titles
 * and summaries are authored prose rather than validated extraction against a
 * supplied passage, and marking them level 1 would assert a rigour the content
 * has not been through. The extraction pipeline produces level 1 facets.
 *
 * Nothing is deleted. `jesus_entries` and its satellites survive this
 * migration so a rollback keeps the corpus.
 */

/** Which former `kind` values describe an episode rather than a saying. */
const ACTION_KINDS = [
  "MIRACLE",
  "ENCOUNTER",
  "COMPASSION",
  "CONFRONTATION",
] as const;

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Migrating Jesus entries onto the event graph...");

  const entries = await db
    .selectFrom("jesus_entries")
    .select([
      "entry_id",
      "slug",
      "kind",
      "title",
      "summary",
      "quote",
      "quote_reference",
      "period_id",
      "chronology_order",
      "harmony_key",
      "sort_order",
    ])
    .where("is_active", "=", true)
    .orderBy("sort_order")
    .execute();

  if (entries.length === 0) {
    console.log("  no entries to migrate — skipping.");
    return;
  }

  // ── Group into events ───────────────────────────────────────────────────
  // A cluster key of `harmony:<key>` groups parallel accounts; entries without
  // a harmony key stand alone under their own slug.
  const clusters = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.harmony_key
      ? `harmony:${entry.harmony_key}`
      : `entry:${entry.slug}`;
    const bucket = clusters.get(key) ?? [];
    bucket.push(entry);
    clusters.set(key, bucket);
  }

  const isActionKind = (kind: string) =>
    (ACTION_KINDS as readonly string[]).includes(kind);

  /** The entry a cluster should be named after: the episode, not the saying. */
  function leadEntry(bucket: typeof entries) {
    return bucket.find((e) => isActionKind(e.kind)) ?? bucket[0];
  }

  const eventIdByEntryId = new Map<string, string>();
  let eventCount = 0;
  let facetCount = 0;

  for (const [key, bucket] of clusters) {
    const lead = leadEntry(bucket);

    // A grouped cluster is a harmonization judgement; a lone entry is not a
    // harmonization at all, so it cannot be wrong about one.
    const parallelConfidence = bucket.length > 1 ? "probable" : "high";

    const placed = bucket
      .filter((e) => e.chronology_order != null)
      .sort(
        (a, b) =>
          (a.chronology_order as number) - (b.chronology_order as number),
      );
    const anchor = placed[0] ?? lead;

    const event = await db
      .insertInto("jesus_events")
      .values({
        slug: key.startsWith("harmony:") ? `event-${key.slice(8)}` : lead.slug,
        title: lead.title,
        summary: lead.summary,
        period_id: anchor.period_id,
        sequence: anchor.chronology_order,
        // Authored placement, not reviewed harmonization.
        chronology_confidence: "probable",
        parallel_confidence: parallelConfidence,
        is_active: true,
      })
      .onConflict((oc) => oc.column("slug").doNothing())
      .returning(["event_id"])
      .executeTakeFirst();

    if (!event) continue;
    eventCount++;

    for (const entry of bucket) {
      eventIdByEntryId.set(entry.entry_id, event.event_id);

      const action = isActionKind(entry.kind);
      // The entry's own leading reference becomes the facet's anchor.
      const primaryRef = await db
        .selectFrom("jesus_entry_references")
        .where("entry_id", "=", entry.entry_id)
        .select(["book_id", "chapter", "verse_start", "verse_end"])
        .orderBy("sort_order")
        .executeTakeFirst();

      await db
        .insertInto("jesus_facets")
        .values({
          event_id: event.event_id,
          slug: entry.slug,
          mode: action ? "ACTION" : "WORD",
          type: entry.kind,
          // Speech has a speaker; an episode has an actor. Setting only the
          // relevant one keeps the "every command" and "everything He did"
          // queries honest.
          speaker: action ? null : "JESUS",
          actor: action ? "JESUS" : null,
          title: entry.title,
          text: entry.quote,
          summary: entry.summary,
          book_id: primaryRef?.book_id ?? null,
          chapter: primaryRef?.chapter ?? null,
          verse_start: primaryRef?.verse_start ?? null,
          verse_end: primaryRef?.verse_end ?? null,
          provenance: 2,
          sort_order: entry.sort_order ?? 0,
          is_active: true,
        })
        .onConflict((oc) => oc.column("slug").doNothing())
        .execute();
      facetCount++;
    }
  }

  console.log(`  ${eventCount} events, ${facetCount} facets`);

  // ── Roll references up to the event ─────────────────────────────────────
  //
  // One passage per (event, book, chapter), spanning the widest range any of
  // the cluster's facets cited. Without the merge, a facet's narrow quote
  // reference would surface as if it were a separate account — the stilling of
  // the storm would list "Matthew 8:23-27" and "Matthew 8:26" side by side and
  // the Compare tab would show six columns for a three-Gospel event. The
  // narrow reference still lives on the facet, which is where it belongs.
  //
  // A NULL verse_start means the whole chapter, so it must win the merge
  // rather than being treated as verse 0.
  await sql`
    INSERT INTO jesus_event_passages
      (event_id, book_id, chapter, verse_start, verse_end, is_primary, sort_order)
    SELECT event_id, book_id, chapter,
           CASE WHEN bool_or(verse_start IS NULL) THEN NULL ELSE MIN(verse_start) END,
           CASE WHEN bool_or(verse_start IS NULL) THEN NULL ELSE MAX(verse_end) END,
           false,
           book_id
      FROM (
        SELECT f.event_id, r.book_id, r.chapter, r.verse_start, r.verse_end
          FROM jesus_entry_references r
          JOIN jesus_entries e ON e.entry_id = r.entry_id
          JOIN jesus_facets f ON f.slug = e.slug
      ) refs
     GROUP BY event_id, book_id, chapter
    ON CONFLICT DO NOTHING
  `.execute(db);

  // The account the card leads with: the earliest book, earliest chapter.
  await sql`
    UPDATE jesus_event_passages p
       SET is_primary = true
      FROM (
        SELECT DISTINCT ON (event_id) passage_id
          FROM jesus_event_passages
         ORDER BY event_id, book_id, chapter
      ) lead
     WHERE lead.passage_id = p.passage_id
  `.execute(db);

  // Canonical order within each Gospel: the sequence this account presents the
  // events in, which is a fact about the text and separate from `sequence`.
  await sql`
    UPDATE jesus_event_passages p
       SET canonical_order = ranked.rn
      FROM (
        SELECT passage_id,
               ROW_NUMBER() OVER (
                 PARTITION BY book_id ORDER BY chapter, COALESCE(verse_start, 0)
               ) AS rn
          FROM jesus_event_passages
      ) ranked
     WHERE ranked.passage_id = p.passage_id
  `.execute(db);

  // ── Themes ──────────────────────────────────────────────────────────────
  await sql`
    INSERT INTO jesus_event_themes (event_id, theme_id)
    SELECT DISTINCT f.event_id, et.theme_id
      FROM jesus_entry_themes et
      JOIN jesus_entries e ON e.entry_id = et.entry_id
      JOIN jesus_facets f ON f.slug = e.slug
    ON CONFLICT DO NOTHING
  `.execute(db);

  // ── Collections now curate events ───────────────────────────────────────
  await db.schema
    .createTable("jesus_collection_events")
    .addColumn("collection_id", "uuid", (col) =>
      col
        .references("jesus_collections.collection_id")
        .onDelete("cascade")
        .notNull(),
    )
    .addColumn("event_id", "uuid", (col) =>
      col.references("jesus_events.event_id").onDelete("cascade").notNull(),
    )
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0))
    .addPrimaryKeyConstraint("jesus_collection_events_pkey", [
      "collection_id",
      "event_id",
    ])
    .execute();

  // Two members of one cluster in the same study collapse to a single event,
  // which is the point — hence DISTINCT ON and the lowest sort_order winning.
  await sql`
    INSERT INTO jesus_collection_events (collection_id, event_id, sort_order)
    SELECT DISTINCT ON (ce.collection_id, f.event_id)
           ce.collection_id, f.event_id, ce.sort_order
      FROM jesus_collection_entries ce
      JOIN jesus_entries e ON e.entry_id = ce.entry_id
      JOIN jesus_facets f ON f.slug = e.slug
     ORDER BY ce.collection_id, f.event_id, ce.sort_order
    ON CONFLICT DO NOTHING
  `.execute(db);

  const [{ count: passages }] = await sql<{ count: string }>`
    SELECT COUNT(*)::text AS count FROM jesus_event_passages
  `
    .execute(db)
    .then((r) => r.rows);

  console.log(`  ${passages} event passages`);
  console.log("Jesus entries migrated onto the event graph.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Reverting Jesus event graph migration...");
  await db.schema.dropTable("jesus_collection_events").ifExists().execute();
  // The graph tables themselves are dropped by the migration that created
  // them; here we only clear the rows this migration inserted.
  await db.deleteFrom("jesus_event_themes").execute();
  await db.deleteFrom("jesus_event_passages").execute();
  await db.deleteFrom("jesus_facets").execute();
  await db.deleteFrom("jesus_events").execute();
  console.log("Reverted.");
}
