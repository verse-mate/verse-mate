import type Database from "database/src/models/Database";
import { type ExpressionBuilder, sql } from "kysely";
import type { db } from "../../shared/shared.plugin";
import { JESUS_FACET_TYPES, type JesusFacetType } from "../jesus.constants";
import { formatReference } from "../utils/reference.utils";

const DEFAULT_LANGUAGE = "en-US";

export type JesusConfidence = "high" | "probable" | "disputed";

/** Filters over the graph. Every category in the product is one of these. */
export interface JesusEventFilter {
  /** Facet types — an event matches if any of its facets does. */
  types?: JesusFacetType[];
  mode?: "WORD" | "ACTION";
  /** `JESUS` on a WORD facet; the "every question He asked" guard. */
  speaker?: string;
  /** `JESUS` on an ACTION facet; the "everything He did" guard. */
  actor?: string;
  themeSlug?: string;
  periodSlug?: string;
  bookId?: number;
  person?: string;
  search?: string;
  eventIds?: string[];
}

export interface JesusPassageRow {
  book_id: number;
  book_name: string;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  canonical_order: number | null;
  is_primary: boolean;
  emphasis: string | null;
  unique_to_account: string | null;
  display: string;
}

export interface JesusFacetRow {
  slug: string;
  mode: string;
  type: string;
  speaker: string | null;
  actor: string | null;
  title: string;
  text: string | null;
  summary: string | null;
  provenance: number;
  reference: string | null;
  book_id: number | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
}

export interface JesusEventRow {
  event_id: string;
  slug: string;
  title: string;
  summary: string | null;
  period_slug: string | null;
  period_name: string | null;
  sequence: number | null;
  chronology_confidence: JesusConfidence;
  parallel_confidence: JesusConfidence;
  location: string | null;
  approximate_date: string | null;
  passages: JesusPassageRow[];
  facets: JesusFacetRow[];
  themes: { slug: string; name: string }[];
}

/**
 * Data access for the event graph.
 *
 * The shape mirrors `JesusRepository`: page the events, then hydrate passages,
 * facets and themes for exactly that page. Joining all of them in one statement
 * multiplies rows (an event with 3 passages, 4 facets and 3 themes returns 36)
 * and forces de-duplication in JS anyway.
 */
export class JesusEventRepository {
  constructor(private readonly db: db) {}

  private get conn() {
    return this.db.getOrCreateConnection();
  }

  /**
   * The filter as a boolean expression so the page and its total can never
   * disagree. Facet predicates are EXISTS subqueries rather than joins,
   * because an event matching on two facets must still be one row.
   */
  private filterExpression(filter: JesusEventFilter) {
    return (eb: ExpressionBuilder<Database, "jesus_events">) => {
      const conditions = [eb("jesus_events.is_active", "=", true)];

      const facetPredicates =
        filter.types || filter.mode || filter.speaker || filter.actor;

      if (facetPredicates) {
        // An explicit but empty type list means "nothing matches" — the caller
        // named a category the taxonomy does not have.
        if (filter.types && filter.types.length === 0) {
          conditions.push(eb.val<boolean>(false));
        } else {
          conditions.push(
            eb.exists(
              eb
                .selectFrom("jesus_facets")
                .whereRef("jesus_facets.event_id", "=", "jesus_events.event_id")
                .where("jesus_facets.is_active", "=", true)
                .$if(!!filter.types?.length, (qb) =>
                  qb.where("jesus_facets.type", "in", filter.types as string[]),
                )
                .$if(!!filter.mode, (qb) =>
                  qb.where("jesus_facets.mode", "=", filter.mode as string),
                )
                .$if(!!filter.speaker, (qb) =>
                  qb.where(
                    "jesus_facets.speaker",
                    "=",
                    filter.speaker as string,
                  ),
                )
                .$if(!!filter.actor, (qb) =>
                  qb.where("jesus_facets.actor", "=", filter.actor as string),
                )
                .select("jesus_facets.facet_id"),
            ),
          );
        }
      }

      if (filter.eventIds) {
        conditions.push(
          filter.eventIds.length
            ? eb("jesus_events.event_id", "in", filter.eventIds)
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
                "jesus_events.period_id",
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
              .selectFrom("jesus_event_themes")
              .innerJoin(
                "jesus_themes",
                "jesus_themes.theme_id",
                "jesus_event_themes.theme_id",
              )
              .whereRef(
                "jesus_event_themes.event_id",
                "=",
                "jesus_events.event_id",
              )
              .where("jesus_themes.slug", "=", filter.themeSlug)
              .select("jesus_event_themes.event_id"),
          ),
        );
      }

      if (filter.bookId) {
        conditions.push(
          eb.exists(
            eb
              .selectFrom("jesus_event_passages")
              .whereRef(
                "jesus_event_passages.event_id",
                "=",
                "jesus_events.event_id",
              )
              .where("jesus_event_passages.book_id", "=", filter.bookId)
              .select("jesus_event_passages.event_id"),
          ),
        );
      }

      if (filter.person) {
        conditions.push(
          eb.exists(
            eb
              .selectFrom("jesus_event_people")
              .whereRef(
                "jesus_event_people.event_id",
                "=",
                "jesus_events.event_id",
              )
              .where(
                sql<boolean>`jesus_event_people.person ILIKE ${`%${filter.person}%`}`,
              )
              .select("jesus_event_people.event_id"),
          ),
        );
      }

      if (filter.search?.trim()) {
        const term = `%${filter.search.trim()}%`;
        conditions.push(
          eb.or([
            sql<boolean>`jesus_events.title ILIKE ${term}`,
            sql<boolean>`jesus_events.summary ILIKE ${term}`,
            // Searching only event titles would miss "prodigal" on an event
            // named after its episode, so facets are searched too.
            eb.exists(
              eb
                .selectFrom("jesus_facets")
                .whereRef("jesus_facets.event_id", "=", "jesus_events.event_id")
                .where((fb) =>
                  fb.or([
                    sql<boolean>`jesus_facets.title ILIKE ${term}`,
                    sql<boolean>`jesus_facets.text ILIKE ${term}`,
                    sql<boolean>`jesus_facets.summary ILIKE ${term}`,
                  ]),
                )
                .select("jesus_facets.facet_id"),
            ),
          ]),
        );
      }

      return eb.and(conditions);
    };
  }

  async countEvents(filter: JesusEventFilter = {}): Promise<number> {
    const row = await this.conn
      .selectFrom("jesus_events")
      .where(this.filterExpression(filter))
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  async listEvents(
    filter: JesusEventFilter = {},
    options: {
      limit?: number;
      offset?: number;
      orderBy?: "chronology" | "title";
      languageCode?: string;
    } = {},
  ): Promise<JesusEventRow[]> {
    const {
      limit = 50,
      offset = 0,
      orderBy = "chronology",
      languageCode = DEFAULT_LANGUAGE,
    } = options;

    let query = this.conn
      .selectFrom("jesus_events")
      .leftJoin(
        "jesus_periods",
        "jesus_periods.period_id",
        "jesus_events.period_id",
      )
      .where(this.filterExpression(filter))
      .select([
        "jesus_events.event_id",
        "jesus_events.slug",
        "jesus_events.title",
        "jesus_events.summary",
        "jesus_events.sequence",
        "jesus_events.chronology_confidence",
        "jesus_events.parallel_confidence",
        "jesus_events.location",
        "jesus_events.approximate_date",
        "jesus_periods.slug as period_slug",
        "jesus_periods.name as period_name",
      ]);

    query =
      orderBy === "chronology"
        ? query
            .orderBy(sql`jesus_periods.sort_order NULLS LAST`)
            .orderBy(sql`jesus_events.sequence NULLS LAST`)
            .orderBy("jesus_events.title")
        : query.orderBy("jesus_events.title");

    const rows = await query.limit(limit).offset(offset).execute();
    if (rows.length === 0) return [];

    return await this.hydrate(rows, languageCode);
  }

  async getEventBySlug(
    slug: string,
    languageCode = DEFAULT_LANGUAGE,
  ): Promise<JesusEventRow | null> {
    const row = await this.conn
      .selectFrom("jesus_events")
      .leftJoin(
        "jesus_periods",
        "jesus_periods.period_id",
        "jesus_events.period_id",
      )
      .where("jesus_events.slug", "=", slug)
      .where("jesus_events.is_active", "=", true)
      .select([
        "jesus_events.event_id",
        "jesus_events.slug",
        "jesus_events.title",
        "jesus_events.summary",
        "jesus_events.sequence",
        "jesus_events.chronology_confidence",
        "jesus_events.parallel_confidence",
        "jesus_events.location",
        "jesus_events.approximate_date",
        "jesus_periods.slug as period_slug",
        "jesus_periods.name as period_name",
      ])
      .executeTakeFirst();

    if (!row) return null;
    const [hydrated] = await this.hydrate([row], languageCode);
    return hydrated ?? null;
  }

  /**
   * Resolve an event from a facet slug.
   *
   * Facets inherited their slugs from the previous entry model, so every
   * /jesus/entry/<slug> URL already in the wild resolves to the event that
   * absorbed it.
   */
  async getEventByFacetSlug(
    facetSlug: string,
    languageCode = DEFAULT_LANGUAGE,
  ): Promise<JesusEventRow | null> {
    const row = await this.conn
      .selectFrom("jesus_facets")
      .innerJoin(
        "jesus_events",
        "jesus_events.event_id",
        "jesus_facets.event_id",
      )
      .where("jesus_facets.slug", "=", facetSlug)
      .select("jesus_events.slug")
      .executeTakeFirst();

    return row ? await this.getEventBySlug(row.slug, languageCode) : null;
  }

  /**
   * The verse → event lookup behind "View Jesus Event".
   *
   * A whole-chapter passage (NULL verse bounds) covers any verse in it; a
   * bounded passage covers the verse when it falls inside the range. When no
   * verse is supplied the whole chapter matches.
   */
  async findEventsForPassage(
    bookId: number,
    chapter: number,
    verse?: number,
    languageCode = DEFAULT_LANGUAGE,
  ): Promise<JesusEventRow[]> {
    // Resolved in two steps rather than one DISTINCT query. An event can have
    // several passages in the same chapter, so the match has to collapse to one
    // row per event — and ranking by span needs an aggregate, which cannot sit
    // beside SELECT DISTINCT.
    const matches = await this.conn
      .selectFrom("jesus_event_passages")
      .innerJoin(
        "jesus_events",
        "jesus_events.event_id",
        "jesus_event_passages.event_id",
      )
      .where("jesus_event_passages.book_id", "=", bookId)
      .where("jesus_event_passages.chapter", "=", chapter)
      .where("jesus_events.is_active", "=", true)
      .$if(verse != null, (qb) =>
        qb.where((eb) =>
          eb.or([
            // A whole-chapter passage covers every verse in it.
            eb("jesus_event_passages.verse_start", "is", null),
            eb.and([
              eb("jesus_event_passages.verse_start", "<=", verse as number),
              eb.or([
                eb("jesus_event_passages.verse_end", "is", null),
                eb("jesus_event_passages.verse_end", ">=", verse as number),
              ]),
            ]),
          ]),
        ),
      )
      .select((eb) => [
        "jesus_event_passages.event_id",
        // Narrowest first when a verse is given: a verse inside a specific
        // pericope is more useful than the discourse containing it. A
        // whole-chapter passage counts as the widest possible span.
        eb.fn
          .min(
            sql<number>`COALESCE(jesus_event_passages.verse_end, 9999) - COALESCE(jesus_event_passages.verse_start, 0)`,
          )
          .as("span"),
        // Reading order, used when the whole chapter was asked for.
        eb.fn
          .min(sql<number>`COALESCE(jesus_event_passages.verse_start, 0)`)
          .as("position"),
      ])
      .groupBy("jesus_event_passages.event_id")
      // Asking about a verse is a "what is this?" question, so precision wins.
      // Asking about a chapter is a "what's in here?" question, so the events
      // come back in the order the reader will meet them.
      .orderBy(verse != null ? "span" : "position", "asc")
      .limit(5)
      .execute();

    if (matches.length === 0) return [];

    const events = await this.listEvents(
      { eventIds: matches.map((m) => m.event_id) },
      { limit: matches.length, languageCode },
    );

    // listEvents orders chronologically; restore the specificity ranking.
    const rank = new Map(matches.map((m, i) => [m.event_id, i]));
    return events.sort(
      (a, b) => (rank.get(a.event_id) ?? 0) - (rank.get(b.event_id) ?? 0),
    );
  }

  async getReveals(eventId: string, languageCode = DEFAULT_LANGUAGE) {
    return await this.conn
      .selectFrom("jesus_event_reveals")
      .where("event_id", "=", eventId)
      .where("is_active", "=", true)
      .where("language_code", "=", languageCode)
      .select(["channel", "content", "source_ref", "provenance"])
      .orderBy("channel")
      .orderBy("sort_order")
      .execute();
  }

  async getReactions(eventId: string, languageCode = DEFAULT_LANGUAGE) {
    return await this.conn
      .selectFrom("jesus_event_reactions")
      .where("event_id", "=", eventId)
      .where("language_code", "=", languageCode)
      .select(["who", "what", "source_ref", "provenance"])
      .orderBy("sort_order")
      .execute();
  }

  async getPeople(eventId: string) {
    return await this.conn
      .selectFrom("jesus_event_people")
      .where("event_id", "=", eventId)
      .select(["person", "role"])
      .orderBy("person")
      .execute();
  }

  async getExplanation(eventId: string, languageCode: string, type: string) {
    return await this.conn
      .selectFrom("jesus_event_explanations")
      .where("event_id", "=", eventId)
      .where("language_code", "=", languageCode)
      .where("type", "=", type)
      .where("is_active", "=", true)
      .select(["content", "provenance", "model", "reviewed_at"])
      .orderBy("version", "desc")
      .executeTakeFirst();
  }

  async saveExplanation(input: {
    eventId: string;
    type: string;
    content: string;
    languageCode: string;
    provenance: number;
    promptId?: number | null;
    model?: string | null;
  }) {
    await this.conn
      .insertInto("jesus_event_explanations")
      .values({
        event_id: input.eventId,
        type: input.type,
        content: input.content,
        language_code: input.languageCode,
        provenance: input.provenance,
        prompt_id: input.promptId ?? null,
        model: input.model ?? null,
        is_active: true,
        version: 1,
      })
      .onConflict((oc) =>
        oc
          .columns(["event_id", "language_code", "type"])
          // The uniqueness guarantee is a PARTIAL index (only over active
          // rows), so the conflict target must repeat its predicate — without
          // it Postgres cannot match an index and rejects the statement.
          .where("is_active", "=", true)
          .doUpdateSet({
            content: input.content,
            provenance: input.provenance,
            prompt_id: input.promptId ?? null,
            model: input.model ?? null,
            is_active: true,
            updated_at: new Date(),
          }),
      )
      .execute();
  }

  /** Counts per facet type, zero-filled so the hub never omits a category. */
  async getFacetTypeCounts(): Promise<Record<string, number>> {
    const rows = await this.conn
      .selectFrom("jesus_facets")
      .where("is_active", "=", true)
      .select((eb) => ["type", eb.fn.countAll<string>().as("count")])
      .groupBy("type")
      .execute();

    const counts: Record<string, number> = {};
    for (const type of JESUS_FACET_TYPES) counts[type] = 0;
    for (const row of rows) counts[row.type] = Number(row.count);
    return counts;
  }

  async getEventIdsForCollection(collectionId: string): Promise<string[]> {
    const rows = await this.conn
      .selectFrom("jesus_collection_events")
      .innerJoin(
        "jesus_events",
        "jesus_events.event_id",
        "jesus_collection_events.event_id",
      )
      .where("jesus_collection_events.collection_id", "=", collectionId)
      .where("jesus_events.is_active", "=", true)
      .select("jesus_collection_events.event_id")
      .orderBy("jesus_collection_events.sort_order")
      .execute();
    return rows.map((r) => r.event_id);
  }

  // ── Hydration ───────────────────────────────────────────────────────────

  private async hydrate(
    rows: Array<{
      event_id: string;
      slug: string;
      title: string;
      summary: string | null;
      sequence: number | null;
      chronology_confidence: string;
      parallel_confidence: string;
      location: string | null;
      approximate_date: string | null;
      period_slug: string | null;
      period_name: string | null;
    }>,
    languageCode: string,
  ): Promise<JesusEventRow[]> {
    const ids = rows.map((r) => r.event_id);
    const [passages, facets, themes] = await Promise.all([
      this.getPassagesFor(ids),
      this.getFacetsFor(ids),
      this.getThemesFor(ids, languageCode),
    ]);

    return rows.map((row) => ({
      event_id: row.event_id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      period_slug: row.period_slug,
      period_name: row.period_name,
      sequence: row.sequence,
      chronology_confidence: row.chronology_confidence as JesusConfidence,
      parallel_confidence: row.parallel_confidence as JesusConfidence,
      location: row.location,
      approximate_date: row.approximate_date,
      passages: passages.get(row.event_id) ?? [],
      facets: facets.get(row.event_id) ?? [],
      themes: themes.get(row.event_id) ?? [],
    }));
  }

  private async getPassagesFor(ids: string[]) {
    const rows = await this.conn
      .selectFrom("jesus_event_passages")
      .innerJoin("books", "books.book_id", "jesus_event_passages.book_id")
      .where("jesus_event_passages.event_id", "in", ids)
      .select([
        "jesus_event_passages.event_id",
        "jesus_event_passages.book_id",
        "books.name as book_name",
        "jesus_event_passages.chapter",
        "jesus_event_passages.verse_start",
        "jesus_event_passages.verse_end",
        "jesus_event_passages.canonical_order",
        "jesus_event_passages.is_primary",
        "jesus_event_passages.emphasis",
        "jesus_event_passages.unique_to_account",
      ])
      .orderBy("jesus_event_passages.book_id")
      .orderBy("jesus_event_passages.chapter")
      .execute();

    const map = new Map<string, JesusPassageRow[]>();
    for (const row of rows) {
      const list = map.get(row.event_id) ?? [];
      list.push({
        book_id: row.book_id,
        book_name: row.book_name,
        chapter: row.chapter,
        verse_start: row.verse_start,
        verse_end: row.verse_end,
        canonical_order: row.canonical_order,
        is_primary: !!row.is_primary,
        emphasis: row.emphasis,
        unique_to_account: row.unique_to_account,
        display: formatReference({
          book_name: row.book_name,
          chapter: row.chapter,
          verse_start: row.verse_start,
          verse_end: row.verse_end,
        }),
      });
      map.set(row.event_id, list);
    }
    return map;
  }

  private async getFacetsFor(ids: string[]) {
    const rows = await this.conn
      .selectFrom("jesus_facets")
      .leftJoin("books", "books.book_id", "jesus_facets.book_id")
      .where("jesus_facets.event_id", "in", ids)
      .where("jesus_facets.is_active", "=", true)
      .select([
        "jesus_facets.event_id",
        "jesus_facets.slug",
        "jesus_facets.mode",
        "jesus_facets.type",
        "jesus_facets.speaker",
        "jesus_facets.actor",
        "jesus_facets.title",
        "jesus_facets.text",
        "jesus_facets.summary",
        "jesus_facets.provenance",
        "jesus_facets.book_id",
        "books.name as book_name",
        "jesus_facets.chapter",
        "jesus_facets.verse_start",
        "jesus_facets.verse_end",
      ])
      // Actions before words within an event: what happened, then what was said.
      .orderBy("jesus_facets.mode", "asc")
      .orderBy("jesus_facets.sort_order")
      .execute();

    const map = new Map<string, JesusFacetRow[]>();
    for (const row of rows) {
      const list = map.get(row.event_id) ?? [];
      list.push({
        slug: row.slug,
        mode: row.mode,
        type: row.type,
        speaker: row.speaker,
        actor: row.actor,
        title: row.title,
        text: row.text,
        summary: row.summary,
        provenance: row.provenance,
        book_id: row.book_id,
        chapter: row.chapter,
        verse_start: row.verse_start,
        verse_end: row.verse_end,
        reference:
          row.book_name && row.chapter
            ? formatReference({
                book_name: row.book_name,
                chapter: row.chapter,
                verse_start: row.verse_start,
                verse_end: row.verse_end,
              })
            : null,
      });
      map.set(row.event_id, list);
    }
    return map;
  }

  private async getThemesFor(ids: string[], languageCode: string) {
    const rows = await this.conn
      .selectFrom("jesus_event_themes")
      .innerJoin(
        "jesus_themes",
        "jesus_themes.theme_id",
        "jesus_event_themes.theme_id",
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
      .where("jesus_event_themes.event_id", "in", ids)
      .where("jesus_themes.is_active", "=", true)
      .select([
        "jesus_event_themes.event_id",
        "jesus_themes.slug",
        "jesus_themes.name as original_name",
        "jesus_label_translations.translated_name",
      ])
      .orderBy("jesus_themes.sort_order")
      .execute();

    const map = new Map<string, { slug: string; name: string }[]>();
    for (const row of rows) {
      const list = map.get(row.event_id) ?? [];
      list.push({
        slug: row.slug,
        name: row.translated_name || row.original_name,
      });
      map.set(row.event_id, list);
    }
    return map;
  }
}
