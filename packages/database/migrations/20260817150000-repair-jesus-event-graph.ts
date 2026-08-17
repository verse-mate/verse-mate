import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

// ─────────────────────────────────────────────────────────────────────────────
// Frozen copy of `packages/database/src/seeds/jesus-events.project.ts`.
//
// A migration may not import application source. The production image copies
// only `dist/` and `migrations/` into `/app` and then installs exactly one
// dependency (`bun install kysely@0.27.4`) so that migration files can resolve
// `kysely` — nothing else is present. `import type` from `../src` survives
// because types are erased at compile time, which is why every other migration
// here gets away with it; a *value* import does not, and this one crashed
// `migrate-deploy` on boot, exiting non-zero and triggering an App Platform
// rollback to the previous image.
//
// Duplicating the logic is also the correct migration semantics: an applied
// migration is a historical fact, and it should not change retroactively
// because the seeder's copy was later edited. The seeder keeps its own copy at
// the path above and is free to evolve; this one is pinned to what shipped.
// ─────────────────────────────────────────────────────────────────────────────

/** Which former `kind` values describe an episode rather than a saying. */
const ACTION_KINDS = [
  "MIRACLE",
  "ENCOUNTER",
  "COMPASSION",
  "CONFRONTATION",
] as const;

interface JesusProjectionResult {
  events: number;
  facets: number;
  passages: number;
}

async function projectJesusEventsFromEntries(
  db: Kysely<Database>,
): Promise<JesusProjectionResult> {
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
    return { events: 0, facets: 0, passages: 0 };
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

  let eventCount = 0;
  let facetCount = 0;

  for (const [key, bucket] of clusters) {
    const lead = leadEntry(bucket);
    const eventSlug = key.startsWith("harmony:")
      ? `event-${key.slice(8)}`
      : lead.slug;

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

    const inserted = await db
      .insertInto("jesus_events")
      .values({
        slug: eventSlug,
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

    // A conflict means this event was projected on an earlier run. Resolve the
    // existing row rather than skipping the cluster — otherwise a re-run after
    // new parallel accounts were seeded would silently drop their facets.
    const eventId =
      inserted?.event_id ??
      (
        await db
          .selectFrom("jesus_events")
          .where("slug", "=", eventSlug)
          .select("event_id")
          .executeTakeFirst()
      )?.event_id;

    if (!eventId) continue;
    if (inserted) eventCount++;

    for (const entry of bucket) {
      const action = isActionKind(entry.kind);
      // The entry's own leading reference becomes the facet's anchor.
      const primaryRef = await db
        .selectFrom("jesus_entry_references")
        .where("entry_id", "=", entry.entry_id)
        .select(["book_id", "chapter", "verse_start", "verse_end"])
        .orderBy("sort_order")
        .executeTakeFirst();

      const facet = await db
        .insertInto("jesus_facets")
        .values({
          event_id: eventId,
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
        .returning(["facet_id"])
        .executeTakeFirst();

      if (facet) facetCount++;
    }
  }

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
  //
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

  const [{ count }] = await sql<{ count: string }>`
    SELECT COUNT(*)::text AS count FROM jesus_event_passages
  `
    .execute(db)
    .then((r) => r.rows);

  return { events: eventCount, facets: facetCount, passages: Number(count) };
}

/**
 * Repair the Jesus event graph on databases where it was never built.
 *
 * `20260817130000-migrate-jesus-entries-to-events` projects `jesus_entries`
 * onto the event graph, and creates `jesus_collection_events` on the way. It
 * does both *after* an early return that fires when the corpus is empty:
 *
 *     if (entries.length === 0) { ...; return; }   // ← before the CREATE TABLE
 *
 * On any database that had no corpus when it ran — every fresh environment,
 * production included, because the backend container entrypoint runs
 * `migrate-deploy` and never `db:seed` — that migration therefore records
 * itself as applied while leaving `jesus_collection_events` uncreated. It can
 * never run again, so nothing repairs it: `/jesus/collections/:slug` queries
 * that table and would fail for every Popular Study, permanently.
 *
 * This migration is the repair, and it is deliberately a separate file rather
 * than an edit to the one above — that one has already run in production, so
 * changing it would only alter what fresh databases do while leaving the
 * damaged ones damaged.
 *
 * Both halves are safe on a database that is already correct: the table is
 * created only if absent, and the projection is idempotent.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("jesus_collection_events")
    .ifNotExists()
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

  // Build the graph for any corpus that arrived after the original migration
  // ran. On a production database that has still never been seeded this is a
  // no-op, and `db:seed` will do the projection when it is finally run.
  const result = await projectJesusEventsFromEntries(db);

  if (result.events > 0 || result.facets > 0) {
    console.log(
      `Jesus event graph repaired: ${result.events} events, ${result.facets} facets, ${result.passages} passages`,
    );
  }
}

export async function down(_db: Kysely<Database>): Promise<void> {
  // Intentionally empty. The table this creates belongs to the migration above
  // — dropping it here would take it away from databases that legitimately
  // built it there, and rolling back a repair should not re-break anything.
}
