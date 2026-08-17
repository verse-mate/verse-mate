import type Database from "database/src/models/Database";
import { type ExpressionBuilder, sql } from "kysely";
import type { db } from "../../shared/shared.plugin";
import { JESUS_KINDS, type JesusKind } from "../jesus.constants";
import { formatReference } from "../utils/reference.utils";

const DEFAULT_LANGUAGE = "en-US";

/** Everything the list endpoints can narrow by. All fields are AND-ed. */
export interface JesusEntryFilter {
  kinds?: JesusKind[];
  themeSlug?: string;
  periodSlug?: string;
  /** "Every miracle in Mark" — narrows to entries with a reference in this book. */
  bookId?: number;
  /** Case-insensitive match against title, summary and quote. */
  search?: string;
  /** Explicit membership, used when resolving a curated collection. */
  entryIds?: string[];
}

export interface JesusReferenceRow {
  book_id: number;
  book_name: string;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  is_primary: boolean;
  display: string;
}

export interface JesusThemeRow {
  theme_id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface JesusEntryRow {
  entry_id: string;
  slug: string;
  kind: string;
  title: string;
  summary: string | null;
  quote: string | null;
  quote_reference: string | null;
  period_id: string | null;
  period_slug: string | null;
  period_name: string | null;
  chronology_order: number | null;
  harmony_key: string | null;
  sort_order: number | null;
  is_translated: boolean;
  references: JesusReferenceRow[];
  themes: JesusThemeRow[];
}

export interface JesusPeriodRow {
  period_id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  sort_order: number;
  entry_count: number;
  is_translated: boolean;
}

export interface JesusCollectionRow {
  collection_id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  filter: unknown | null;
  is_featured: boolean;
  sort_order: number;
  is_translated: boolean;
}

/**
 * Data access for the Jesus feature.
 *
 * Reads follow a consistent three-query shape: fetch the entry page, then
 * hydrate references and themes for exactly those ids. Joining all three in one
 * statement would multiply rows (an entry with 3 references and 4 themes
 * returns 12 rows) and force de-duplication in JS anyway — three narrow queries
 * are both faster and easier to reason about.
 */
export class JesusRepository {
  constructor(private readonly db: db) {}

  private get conn() {
    return this.db.getOrCreateConnection();
  }

  // ── Taxonomy ────────────────────────────────────────────────────────────

  async getPeriods(languageCode = DEFAULT_LANGUAGE): Promise<JesusPeriodRow[]> {
    const rows = await this.conn
      .selectFrom("jesus_periods")
      .leftJoin("jesus_label_translations", (join) =>
        join
          .onRef(
            "jesus_periods.period_id",
            "=",
            "jesus_label_translations.entity_id",
          )
          .on("jesus_label_translations.entity_type", "=", sql.lit("period"))
          .on(
            "jesus_label_translations.language_code",
            "=",
            sql.lit(languageCode),
          )
          .on("jesus_label_translations.is_active", "=", true),
      )
      .where("jesus_periods.is_active", "=", true)
      .select((eb) => [
        "jesus_periods.period_id",
        "jesus_periods.slug",
        "jesus_periods.name as original_name",
        "jesus_periods.subtitle",
        "jesus_periods.description as original_description",
        "jesus_periods.sort_order",
        "jesus_label_translations.translated_name",
        "jesus_label_translations.translated_description",
        eb
          .selectFrom("jesus_entries")
          .whereRef("jesus_entries.period_id", "=", "jesus_periods.period_id")
          .where("jesus_entries.is_active", "=", true)
          .select(eb.fn.countAll<string>().as("count"))
          .as("entry_count"),
      ])
      .orderBy("jesus_periods.sort_order")
      .execute();

    return rows.map((row) => ({
      period_id: row.period_id,
      slug: row.slug,
      name: row.translated_name || row.original_name,
      subtitle: row.subtitle,
      description: row.translated_description || row.original_description,
      sort_order: row.sort_order,
      entry_count: Number(row.entry_count ?? 0),
      is_translated: !!row.translated_name,
    }));
  }

  async getThemes(
    languageCode = DEFAULT_LANGUAGE,
  ): Promise<
    Array<JesusThemeRow & { entry_count: number; is_translated: boolean }>
  > {
    const rows = await this.conn
      .selectFrom("jesus_themes")
      .leftJoin("jesus_label_translations", (join) =>
        join
          .onRef(
            "jesus_themes.theme_id",
            "=",
            "jesus_label_translations.entity_id",
          )
          .on("jesus_label_translations.entity_type", "=", sql.lit("theme"))
          .on(
            "jesus_label_translations.language_code",
            "=",
            sql.lit(languageCode),
          )
          .on("jesus_label_translations.is_active", "=", true),
      )
      .where("jesus_themes.is_active", "=", true)
      .select((eb) => [
        "jesus_themes.theme_id",
        "jesus_themes.slug",
        "jesus_themes.name as original_name",
        "jesus_themes.description as original_description",
        "jesus_themes.sort_order",
        "jesus_label_translations.translated_name",
        "jesus_label_translations.translated_description",
        eb
          .selectFrom("jesus_entry_themes")
          .innerJoin(
            "jesus_entries",
            "jesus_entries.entry_id",
            "jesus_entry_themes.entry_id",
          )
          .whereRef("jesus_entry_themes.theme_id", "=", "jesus_themes.theme_id")
          .where("jesus_entries.is_active", "=", true)
          .select(eb.fn.countAll<string>().as("count"))
          .as("entry_count"),
      ])
      .orderBy("jesus_themes.sort_order")
      .execute();

    return rows.map((row) => ({
      theme_id: row.theme_id,
      slug: row.slug,
      name: row.translated_name || row.original_name,
      description: row.translated_description || row.original_description,
      sort_order: row.sort_order,
      entry_count: Number(row.entry_count ?? 0),
      is_translated: !!row.translated_name,
    }));
  }

  async getCollections(
    languageCode = DEFAULT_LANGUAGE,
    options: { featuredOnly?: boolean } = {},
  ): Promise<JesusCollectionRow[]> {
    let query = this.conn
      .selectFrom("jesus_collections")
      .leftJoin("jesus_label_translations", (join) =>
        join
          .onRef(
            "jesus_collections.collection_id",
            "=",
            "jesus_label_translations.entity_id",
          )
          .on(
            "jesus_label_translations.entity_type",
            "=",
            sql.lit("collection"),
          )
          .on(
            "jesus_label_translations.language_code",
            "=",
            sql.lit(languageCode),
          )
          .on("jesus_label_translations.is_active", "=", true),
      )
      .where("jesus_collections.is_active", "=", true);

    if (options.featuredOnly) {
      query = query.where("jesus_collections.is_featured", "=", true);
    }

    const rows = await query
      .select([
        "jesus_collections.collection_id",
        "jesus_collections.slug",
        "jesus_collections.name as original_name",
        "jesus_collections.subtitle",
        "jesus_collections.description as original_description",
        "jesus_collections.filter",
        "jesus_collections.is_featured",
        "jesus_collections.sort_order",
        "jesus_label_translations.translated_name",
        "jesus_label_translations.translated_description",
      ])
      .orderBy("jesus_collections.sort_order")
      .orderBy("jesus_collections.name")
      .execute();

    return rows.map((row) => ({
      collection_id: row.collection_id,
      slug: row.slug,
      name: row.translated_name || row.original_name,
      subtitle: row.subtitle,
      description: row.translated_description || row.original_description,
      filter: row.filter ?? null,
      is_featured: !!row.is_featured,
      sort_order: row.sort_order ?? 0,
      is_translated: !!row.translated_name,
    }));
  }

  async getCollectionBySlug(
    slug: string,
    languageCode = DEFAULT_LANGUAGE,
  ): Promise<JesusCollectionRow | null> {
    const collections = await this.getCollections(languageCode);
    return collections.find((c) => c.slug === slug) ?? null;
  }

  /** Ordered member ids of a hand-curated collection. */
  async getCollectionMemberIds(collectionId: string): Promise<string[]> {
    const rows = await this.conn
      .selectFrom("jesus_collection_entries")
      .innerJoin(
        "jesus_entries",
        "jesus_entries.entry_id",
        "jesus_collection_entries.entry_id",
      )
      .where("jesus_collection_entries.collection_id", "=", collectionId)
      .where("jesus_entries.is_active", "=", true)
      .select(["jesus_collection_entries.entry_id"])
      .orderBy("jesus_collection_entries.sort_order")
      .execute();

    return rows.map((r) => r.entry_id);
  }

  /** Counts keyed by kind, with every known kind present (zero-filled). */
  async getKindCounts(): Promise<Record<string, number>> {
    const rows = await this.conn
      .selectFrom("jesus_entries")
      .where("is_active", "=", true)
      .select((eb) => ["kind", eb.fn.countAll<string>().as("count")])
      .groupBy("kind")
      .execute();

    const counts: Record<string, number> = {};
    for (const kind of JESUS_KINDS) counts[kind] = 0;
    for (const row of rows) counts[row.kind] = Number(row.count);
    return counts;
  }

  // ── Entries ─────────────────────────────────────────────────────────────

  /**
   * The filter as a single boolean expression rather than a chain of
   * `.where()` calls on a concrete builder. Returning an expression lets
   * `listEntries` (which joins periods and translations) and `countEntries`
   * (which joins nothing) share one definition of "matching" — the page and
   * its total can never drift apart.
   */
  private filterExpression(filter: JesusEntryFilter) {
    return (eb: ExpressionBuilder<Database, "jesus_entries">) => {
      const conditions = [eb("jesus_entries.is_active", "=", true)];

      if (filter.kinds) {
        // An explicit but empty kind list means "nothing matches" — the caller
        // resolved a `?kind=` the taxonomy doesn't have. Treating it as "no
        // filter" would answer a typo with the entire corpus.
        conditions.push(
          filter.kinds.length
            ? eb("jesus_entries.kind", "in", filter.kinds)
            : eb.val<boolean>(false),
        );
      }

      if (filter.entryIds) {
        // An explicit but empty id list means "no members", not "no filter".
        conditions.push(
          filter.entryIds.length
            ? eb("jesus_entries.entry_id", "in", filter.entryIds)
            : eb.val<boolean>(false),
        );
      }

      if (filter.periodSlug) {
        conditions.push(
          eb.exists(
            eb
              .selectFrom("jesus_periods")
              .whereRef(
                "jesus_periods.period_id",
                "=",
                "jesus_entries.period_id",
              )
              .where("jesus_periods.slug", "=", filter.periodSlug)
              .select("jesus_periods.period_id"),
          ),
        );
      }

      if (filter.themeSlug) {
        conditions.push(
          eb.exists(
            eb
              .selectFrom("jesus_entry_themes")
              .innerJoin(
                "jesus_themes",
                "jesus_themes.theme_id",
                "jesus_entry_themes.theme_id",
              )
              .whereRef(
                "jesus_entry_themes.entry_id",
                "=",
                "jesus_entries.entry_id",
              )
              .where("jesus_themes.slug", "=", filter.themeSlug)
              .select("jesus_entry_themes.entry_id"),
          ),
        );
      }

      if (filter.bookId) {
        conditions.push(
          eb.exists(
            eb
              .selectFrom("jesus_entry_references")
              .whereRef(
                "jesus_entry_references.entry_id",
                "=",
                "jesus_entries.entry_id",
              )
              .where("jesus_entry_references.book_id", "=", filter.bookId)
              .select("jesus_entry_references.entry_id"),
          ),
        );
      }

      if (filter.search?.trim()) {
        const term = `%${filter.search.trim()}%`;
        conditions.push(
          eb.or([
            sql<boolean>`jesus_entries.title ILIKE ${term}`,
            sql<boolean>`jesus_entries.summary ILIKE ${term}`,
            sql<boolean>`jesus_entries.quote ILIKE ${term}`,
          ]),
        );
      }

      return eb.and(conditions);
    };
  }

  async countEntries(filter: JesusEntryFilter = {}): Promise<number> {
    const row = await this.conn
      .selectFrom("jesus_entries")
      .where(this.filterExpression(filter))
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirst();

    return Number(row?.count ?? 0);
  }

  async listEntries(
    filter: JesusEntryFilter = {},
    options: {
      languageCode?: string;
      limit?: number;
      offset?: number;
      /** Chronological ordering is only meaningful inside "Follow His Life". */
      orderBy?: "default" | "chronology";
    } = {},
  ): Promise<JesusEntryRow[]> {
    const {
      languageCode = DEFAULT_LANGUAGE,
      limit = 100,
      offset = 0,
      orderBy = "default",
    } = options;

    const base = this.conn
      .selectFrom("jesus_entries")
      .leftJoin(
        "jesus_periods",
        "jesus_periods.period_id",
        "jesus_entries.period_id",
      )
      .leftJoin("jesus_entry_translations", (join) =>
        join
          .onRef(
            "jesus_entries.entry_id",
            "=",
            "jesus_entry_translations.entry_id",
          )
          .on(
            "jesus_entry_translations.language_code",
            "=",
            sql.lit(languageCode),
          )
          .on("jesus_entry_translations.is_active", "=", true),
      );

    let query = base
      .where(this.filterExpression(filter))
      .select([
        "jesus_entries.entry_id",
        "jesus_entries.slug",
        "jesus_entries.kind",
        "jesus_entries.title as original_title",
        "jesus_entries.summary as original_summary",
        "jesus_entries.quote as original_quote",
        "jesus_entries.quote_reference",
        "jesus_entries.period_id",
        "jesus_entries.chronology_order",
        "jesus_entries.harmony_key",
        "jesus_entries.sort_order",
        "jesus_periods.slug as period_slug",
        "jesus_periods.name as period_name",
        "jesus_entry_translations.translated_title",
        "jesus_entry_translations.translated_summary",
        "jesus_entry_translations.translated_quote",
      ]);

    query =
      orderBy === "chronology"
        ? query
            .orderBy("jesus_periods.sort_order")
            .orderBy(sql`jesus_entries.chronology_order NULLS LAST`)
            .orderBy("jesus_entries.title")
        : query
            .orderBy(sql`jesus_entries.sort_order NULLS LAST`)
            .orderBy("jesus_entries.title");

    const rows = await query.limit(limit).offset(offset).execute();
    if (rows.length === 0) return [];

    const entryIds = rows.map((r) => r.entry_id);
    const [referencesByEntry, themesByEntry] = await Promise.all([
      this.getReferencesFor(entryIds),
      this.getThemesFor(entryIds, languageCode),
    ]);

    return rows.map((row) => ({
      entry_id: row.entry_id,
      slug: row.slug,
      kind: row.kind,
      title: row.translated_title || row.original_title,
      summary: row.translated_summary || row.original_summary,
      quote: row.translated_quote || row.original_quote,
      quote_reference: row.quote_reference,
      period_id: row.period_id,
      period_slug: row.period_slug,
      period_name: row.period_name,
      chronology_order: row.chronology_order,
      harmony_key: row.harmony_key,
      sort_order: row.sort_order,
      is_translated: !!row.translated_title,
      references: referencesByEntry.get(row.entry_id) ?? [],
      themes: themesByEntry.get(row.entry_id) ?? [],
    }));
  }

  async getEntryBySlug(
    slug: string,
    languageCode = DEFAULT_LANGUAGE,
  ): Promise<JesusEntryRow | null> {
    const row = await this.conn
      .selectFrom("jesus_entries")
      .leftJoin(
        "jesus_periods",
        "jesus_periods.period_id",
        "jesus_entries.period_id",
      )
      .leftJoin("jesus_entry_translations", (join) =>
        join
          .onRef(
            "jesus_entries.entry_id",
            "=",
            "jesus_entry_translations.entry_id",
          )
          .on(
            "jesus_entry_translations.language_code",
            "=",
            sql.lit(languageCode),
          )
          .on("jesus_entry_translations.is_active", "=", true),
      )
      .where("jesus_entries.slug", "=", slug)
      .where("jesus_entries.is_active", "=", true)
      .select([
        "jesus_entries.entry_id",
        "jesus_entries.slug",
        "jesus_entries.kind",
        "jesus_entries.title as original_title",
        "jesus_entries.summary as original_summary",
        "jesus_entries.quote as original_quote",
        "jesus_entries.quote_reference",
        "jesus_entries.period_id",
        "jesus_entries.chronology_order",
        "jesus_entries.harmony_key",
        "jesus_entries.sort_order",
        "jesus_periods.slug as period_slug",
        "jesus_periods.name as period_name",
        "jesus_entry_translations.translated_title",
        "jesus_entry_translations.translated_summary",
        "jesus_entry_translations.translated_quote",
      ])
      .executeTakeFirst();

    if (!row) return null;

    const [referencesByEntry, themesByEntry] = await Promise.all([
      this.getReferencesFor([row.entry_id]),
      this.getThemesFor([row.entry_id], languageCode),
    ]);

    return {
      entry_id: row.entry_id,
      slug: row.slug,
      kind: row.kind,
      title: row.translated_title || row.original_title,
      summary: row.translated_summary || row.original_summary,
      quote: row.translated_quote || row.original_quote,
      quote_reference: row.quote_reference,
      period_id: row.period_id,
      period_slug: row.period_slug,
      period_name: row.period_name,
      chronology_order: row.chronology_order,
      harmony_key: row.harmony_key,
      sort_order: row.sort_order,
      is_translated: !!row.translated_title,
      references: referencesByEntry.get(row.entry_id) ?? [],
      themes: themesByEntry.get(row.entry_id) ?? [],
    };
  }

  /**
   * Entries worth reading next, ranked in tiers rather than by a flat sum:
   *
   *   1. the same episode told by another gospel (harmony group)
   *   2. the same kind *and* a shared theme — the strongest "more like this"
   *   3. shared themes alone
   *   4. the same kind alone
   *
   * The tiers matter. A flat sum lets two shared broad themes (salvation,
   * discipleship — 50+ entries each) outrank a same-kind neighbour, so
   * "I am the light of the world" would recommend the calling of Matthew ahead
   * of the other I AM statements. Ranking happens in SQL so we only ever
   * transfer `limit` rows.
   */
  async getRelatedEntryIds(entryId: string, limit = 6): Promise<string[]> {
    // Written as raw SQL rather than through the builder: the shared-theme
    // count is needed twice in the score, so it wants a LATERAL join, and the
    // tiered CASE expression reads far better as one block than as chained
    // builder calls.
    const result = await sql<{ entry_id: string; score: number }>`
      SELECT candidate.entry_id,
             (
               -- Tier 1: the same episode told by another gospel.
               CASE WHEN target.harmony_key IS NOT NULL
                         AND candidate.harmony_key = target.harmony_key
                    THEN 1000 ELSE 0 END
               -- Tier 2: same kind AND a shared theme — the strongest
               -- "more like this" signal.
               + CASE WHEN candidate.kind = target.kind AND shared.n > 0
                      THEN 100 ELSE 0 END
               -- Tier 3: shared themes on their own.
               + 10 * shared.n
               -- Tier 4: same kind on its own.
               + CASE WHEN candidate.kind = target.kind THEN 5 ELSE 0 END
             ) AS score
        FROM jesus_entries AS target
        JOIN jesus_entries AS candidate
          ON candidate.entry_id <> target.entry_id
         AND candidate.is_active = true
        JOIN LATERAL (
               SELECT COUNT(*)::int AS n
                 FROM jesus_entry_themes tet
                 JOIN jesus_entry_themes cet ON cet.theme_id = tet.theme_id
                WHERE tet.entry_id = target.entry_id
                  AND cet.entry_id = candidate.entry_id
             ) AS shared ON true
       WHERE target.entry_id = ${entryId}
       ORDER BY score DESC, candidate.title ASC
       LIMIT ${limit}
    `.execute(this.conn);

    return result.rows
      .filter((r) => Number(r.score) > 0)
      .map((r) => r.entry_id);
  }

  async getEntriesByIds(
    entryIds: string[],
    languageCode = DEFAULT_LANGUAGE,
  ): Promise<JesusEntryRow[]> {
    if (entryIds.length === 0) return [];
    const entries = await this.listEntries(
      { entryIds },
      { languageCode, limit: entryIds.length },
    );
    // Preserve the caller's ordering — curated collections and relatedness
    // ranking both depend on it, and listEntries orders by sort_order.
    const byId = new Map(entries.map((e) => [e.entry_id, e]));
    return entryIds
      .map((id) => byId.get(id))
      .filter((e): e is JesusEntryRow => !!e);
  }

  // ── Hydration helpers ───────────────────────────────────────────────────

  private async getReferencesFor(
    entryIds: string[],
  ): Promise<Map<string, JesusReferenceRow[]>> {
    const rows = await this.conn
      .selectFrom("jesus_entry_references")
      .innerJoin("books", "books.book_id", "jesus_entry_references.book_id")
      .where("jesus_entry_references.entry_id", "in", entryIds)
      .select([
        "jesus_entry_references.entry_id",
        "jesus_entry_references.book_id",
        "books.name as book_name",
        "jesus_entry_references.chapter",
        "jesus_entry_references.verse_start",
        "jesus_entry_references.verse_end",
        "jesus_entry_references.is_primary",
        "jesus_entry_references.sort_order",
      ])
      .orderBy("jesus_entry_references.sort_order")
      .orderBy("jesus_entry_references.book_id")
      .execute();

    const map = new Map<string, JesusReferenceRow[]>();
    for (const row of rows) {
      const list = map.get(row.entry_id) ?? [];
      list.push({
        book_id: row.book_id,
        book_name: row.book_name,
        chapter: row.chapter,
        verse_start: row.verse_start,
        verse_end: row.verse_end,
        is_primary: !!row.is_primary,
        display: formatReference({
          book_name: row.book_name,
          chapter: row.chapter,
          verse_start: row.verse_start,
          verse_end: row.verse_end,
        }),
      });
      map.set(row.entry_id, list);
    }
    return map;
  }

  private async getThemesFor(
    entryIds: string[],
    languageCode: string,
  ): Promise<Map<string, JesusThemeRow[]>> {
    const rows = await this.conn
      .selectFrom("jesus_entry_themes")
      .innerJoin(
        "jesus_themes",
        "jesus_themes.theme_id",
        "jesus_entry_themes.theme_id",
      )
      .leftJoin("jesus_label_translations", (join) =>
        join
          .onRef(
            "jesus_themes.theme_id",
            "=",
            "jesus_label_translations.entity_id",
          )
          .on("jesus_label_translations.entity_type", "=", sql.lit("theme"))
          .on(
            "jesus_label_translations.language_code",
            "=",
            sql.lit(languageCode),
          )
          .on("jesus_label_translations.is_active", "=", true),
      )
      .where("jesus_entry_themes.entry_id", "in", entryIds)
      .where("jesus_themes.is_active", "=", true)
      .select([
        "jesus_entry_themes.entry_id",
        "jesus_themes.theme_id",
        "jesus_themes.slug",
        "jesus_themes.name as original_name",
        "jesus_themes.description as original_description",
        "jesus_themes.sort_order",
        "jesus_label_translations.translated_name",
        "jesus_label_translations.translated_description",
      ])
      .orderBy("jesus_themes.sort_order")
      .execute();

    const map = new Map<string, JesusThemeRow[]>();
    for (const row of rows) {
      const list = map.get(row.entry_id) ?? [];
      list.push({
        theme_id: row.theme_id,
        slug: row.slug,
        name: row.translated_name || row.original_name,
        description: row.translated_description || row.original_description,
        sort_order: row.sort_order,
      });
      map.set(row.entry_id, list);
    }
    return map;
  }

  // ── Explanations ────────────────────────────────────────────────────────

  async getEntryExplanation(
    entryId: string,
    languageCode: string,
    type: string,
  ): Promise<{ explanation: string } | undefined> {
    return await this.conn
      .selectFrom("jesus_entry_explanations")
      .where("entry_id", "=", entryId)
      .where("language_code", "=", languageCode)
      .where("type", "=", type)
      .where("is_active", "=", true)
      .select(["explanation"])
      .orderBy("version", "desc")
      .executeTakeFirst();
  }

  async saveEntryExplanation(
    entryId: string,
    explanation: string,
    languageCode: string,
    type: string,
  ): Promise<void> {
    await this.conn
      .insertInto("jesus_entry_explanations")
      .values({
        entry_id: entryId,
        explanation,
        language_code: languageCode,
        type,
        is_active: true,
        version: 1,
      })
      .onConflict((oc) =>
        oc
          .columns(["entry_id", "language_code", "type"])
          // Partial unique index (active rows only) — the conflict target has
          // to carry the same predicate for Postgres to infer it.
          .where("is_active", "=", true)
          .doUpdateSet({
            explanation,
            is_active: true,
            updated_at: new Date(),
          }),
      )
      .execute();
  }
}
