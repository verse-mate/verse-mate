import { BibleRepository } from "../../bible/repository/bible.repository";
import type { db } from "../../shared/shared.plugin";
import { parseAndInjectVerses } from "../../shared/verse-parser";
import {
  JESUS_EVENT_EXPLANATION_TYPES,
  JESUS_FACET_META,
  JESUS_FACET_TYPES,
  JESUS_SECTIONS,
  JESUS_SECTION_META,
  type JesusEventExplanationType,
  type JesusFacetType,
  getFacetTypeFromSlug,
  resolveFacetTypeFilter,
} from "../jesus.constants";
import {
  type JesusEventFilter,
  JesusEventRepository,
  type JesusEventRow,
} from "../repository/jesus-event.repository";
import { JesusRepository } from "../repository/jesus.repository";
import { groupEventsByTopic } from "../utils/topic-grouping.utils";

const DEFAULT_LANGUAGE = "en-US";
const FALLBACK_LANGUAGE = "en-US";

/**
 * Ceiling on a topic-grouped category. No category is near it today; it exists
 * so an unbounded query can never be issued as the corpus grows.
 */
const BROWSE_EVENT_LIMIT = 300;

export interface JesusEventQuery {
  type?: string;
  section?: string;
  mode?: string;
  theme?: string;
  period?: string;
  collection?: string;
  person?: string;
  book_id?: number;
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * Business logic for the event graph.
 *
 * Categories are views: every browse surface in the product resolves to a
 * filter over facets rather than a table of its own. The service owns turning
 * the public query params into that filter, hydrating passages into actual
 * scripture, and assembling the Compare payload from stored data.
 */
export class JesusEventService {
  private events: JesusEventRepository;
  private taxonomy: JesusRepository;
  private bible: BibleRepository;

  constructor(private readonly db: db) {
    this.events = new JesusEventRepository(this.db);
    this.taxonomy = new JesusRepository(this.db);
    this.bible = new BibleRepository(this.db);
  }

  // ── Hub ─────────────────────────────────────────────────────────────────

  async getOverview(languageCode = DEFAULT_LANGUAGE) {
    const [facetCounts, themes, collections, periods, totalEvents] =
      await Promise.all([
        this.events.getFacetTypeCounts(),
        this.taxonomy.getThemes(languageCode),
        this.taxonomy.getCollections(languageCode, { featuredOnly: true }),
        this.taxonomy.getPeriods(languageCode),
        this.events.countEvents(),
      ]);

    const sections = JESUS_SECTIONS.map((section) => {
      const meta = JESUS_SECTION_META[section];
      const types = JESUS_FACET_TYPES.filter(
        (t) => JESUS_FACET_META[t].section === section,
      ).map((type) => ({
        type,
        mode: JESUS_FACET_META[type].mode,
        slug: JESUS_FACET_META[type].slug,
        label: JESUS_FACET_META[type].label,
        singular: JESUS_FACET_META[type].singular,
        blurb: JESUS_FACET_META[type].blurb,
        facet_count: facetCounts[type] ?? 0,
      }));

      return {
        section,
        label: meta.label,
        blurb: meta.blurb,
        sort_order: meta.sortOrder,
        facet_count: types.reduce((sum, t) => sum + t.facet_count, 0),
        types,
      };
    });

    const collectionsWithCounts = await Promise.all(
      collections.map(async (collection) => ({
        slug: collection.slug,
        name: collection.name,
        subtitle: collection.subtitle,
        description: collection.description,
        is_featured: collection.is_featured,
        sort_order: collection.sort_order,
        event_count: await this.countCollectionEvents(collection),
      })),
    );

    return {
      total_events: totalEvents,
      total_facets: Object.values(facetCounts).reduce((a, b) => a + b, 0),
      sections,
      periods: periods.map((p) => ({
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        description: p.description,
        sort_order: p.sort_order,
        event_count: p.entry_count,
      })),
      themes: themes.map((t) => ({
        slug: t.slug,
        name: t.name,
        description: t.description,
        sort_order: t.sort_order,
        event_count: t.entry_count,
      })),
      collections: collectionsWithCounts,
    };
  }

  // ── Browse ──────────────────────────────────────────────────────────────

  /**
   * "Every question Jesus asked" must not match a question someone asked Him,
   * so a word-type filter pins the speaker and an action-type filter pins the
   * actor. Shared by the flat list and the topic-grouped browse so the two can
   * never disagree about what belongs to a category.
   */
  private facetFilter(types: JesusFacetType[] | undefined): JesusEventFilter {
    const filter: JesusEventFilter = { types };
    if (types?.length) {
      const modes = new Set(types.map((t) => JESUS_FACET_META[t].mode));
      if (modes.size === 1) {
        if (modes.has("WORD")) filter.speaker = "JESUS";
        else filter.actor = "JESUS";
      }
    }
    return filter;
  }

  async listEvents(params: JesusEventQuery, languageCode = DEFAULT_LANGUAGE) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);

    const types = resolveFacetTypeFilter(params);
    const filter: JesusEventFilter = {
      ...this.facetFilter(types),
      themeSlug: params.theme,
      periodSlug: params.period,
      bookId: params.book_id,
      person: params.person,
      search: params.q,
    };

    if (params.collection) {
      const collection = await this.taxonomy.getCollectionBySlug(
        params.collection,
        languageCode,
      );
      if (!collection) return { events: [], total: 0, limit, offset };

      const membership = await this.collectionMembership(collection);
      if (membership.eventIds) filter.eventIds = membership.eventIds;
      if (membership.types) {
        filter.types = filter.types
          ? filter.types.filter((t) => membership.types?.includes(t))
          : membership.types;
      }
      if (membership.themeSlug && !filter.themeSlug) {
        filter.themeSlug = membership.themeSlug;
      }
    }

    const [events, total] = await Promise.all([
      this.events.listEvents(filter, { limit, offset, languageCode }),
      this.events.countEvents(filter),
    ]);

    return {
      events: events.map((e) => toEventCard(e, types)),
      total,
      limit,
      offset,
    };
  }

  /**
   * A category, led by topic rather than by a flat list.
   *
   * Same corpus as `listEvents({ type })`, reorganised: the category is
   * introduced, then each topic it touches says what it is about and what He
   * says there, and only then come the events themselves. Every category gets
   * the same treatment — Teachings, Questions, Commands, Claims and the rest
   * are one code path, so the shape of the screen never depends on which tab
   * the reader opened.
   *
   * Returns the whole category in one response rather than paging: the topic
   * headings are only honest if they are computed over the entire set, and a
   * page-2 button under a topic would lie about where the rest of the topic
   * is. `BROWSE_EVENT_LIMIT` is the backstop, and `truncated` tells the client
   * when it bit.
   */
  async browseByType(typeSlug: string, languageCode = DEFAULT_LANGUAGE) {
    const type = getFacetTypeFromSlug(typeSlug);
    if (!type) return null;
    const meta = JESUS_FACET_META[type];

    const filter = this.facetFilter([type]);
    const [rows, themes, facetCounts] = await Promise.all([
      this.events.listEvents(filter, {
        limit: BROWSE_EVENT_LIMIT,
        languageCode,
      }),
      this.taxonomy.getThemes(languageCode),
      this.events.getFacetTypeCounts(),
    ]);

    const events = rows.map((row) => toEventCard(row, [type]));

    return {
      type: {
        type,
        mode: meta.mode,
        slug: meta.slug,
        label: meta.label,
        singular: meta.singular,
        plural: meta.plural,
        section: meta.section,
        blurb: meta.blurb,
        intro: meta.intro,
        event_count: events.length,
        facet_count: facetCounts[type] ?? 0,
      },
      topics: groupEventsByTopic(
        events,
        themes.map((theme) => ({
          slug: theme.slug,
          name: theme.name,
          description: theme.description,
          sort_order: theme.sort_order,
        })),
      ),
      total_events: events.length,
      truncated: rows.length >= BROWSE_EVENT_LIMIT,
    };
  }

  // ── One event ───────────────────────────────────────────────────────────

  async getEvent(
    slug: string,
    languageCode = DEFAULT_LANGUAGE,
    bibleVersion?: string,
  ) {
    let event = await this.events.getEventBySlug(slug, languageCode);
    // Facet slugs came from the previous entry model, so an old
    // /jesus/entry/<slug> link still lands on the event that absorbed it.
    if (!event) {
      event = await this.events.getEventByFacetSlug(slug, languageCode);
    }
    if (!event) return null;

    const [passages, reveals, reactions, people, explanation] =
      await Promise.all([
        bibleVersion
          ? this.hydratePassages(event, bibleVersion)
          : Promise.resolve([]),
        this.events.getReveals(event.event_id, languageCode),
        this.events.getReactions(event.event_id, languageCode),
        this.events.getPeople(event.event_id),
        this.getExplanations(event.event_id, languageCode, bibleVersion),
      ]);

    const related = await this.getRelated(event, languageCode);

    return {
      event: {
        ...toEventCard(event),
        location: event.location,
        approximate_date: event.approximate_date,
        sequence: event.sequence,
        people: people.map((p) => ({ person: p.person, role: p.role })),
      },
      // Split so the client renders Words and Actions as separate tabs without
      // re-deriving the grouping.
      words: event.facets.filter((f) => f.mode === "WORD").map(toFacet),
      actions: event.facets.filter((f) => f.mode === "ACTION").map(toFacet),
      passages,
      reveals: {
        says_about_himself: pickChannel(reveals, "SAYS_ABOUT_HIMSELF"),
        demonstrates: pickChannel(reveals, "DEMONSTRATES"),
        others_say: pickChannel(reveals, "OTHERS_SAY"),
        narrator_says: pickChannel(reveals, "NARRATOR_SAYS"),
      },
      reactions: reactions.map((r) => ({
        who: r.who,
        what: r.what,
        source_ref: r.source_ref,
        provenance: r.provenance,
      })),
      explanation,
      related: related.map((e) => toEventCard(e)),
    };
  }

  /**
   * The Compare tab: one column per Gospel that records the event, assembled
   * from stored `emphasis` / `unique_to_account` rather than generated at
   * request time. Accounts that don't record it are returned as absent so the
   * client can grey the column instead of hiding it.
   */
  async getCompare(
    slug: string,
    languageCode = DEFAULT_LANGUAGE,
    bibleVersion?: string,
  ) {
    const event = await this.events.getEventBySlug(slug, languageCode);
    if (!event) return null;

    const GOSPELS = [
      { book_id: 40, name: "Matthew" },
      { book_id: 41, name: "Mark" },
      { book_id: 42, name: "Luke" },
      { book_id: 43, name: "John" },
    ];

    const passages = bibleVersion
      ? await this.hydratePassages(event, bibleVersion)
      : event.passages.map((p) => ({ ...p, verses: [] }));

    const accounts = GOSPELS.map((gospel) => {
      const matching = passages.filter((p) => p.book_id === gospel.book_id);
      return {
        book_id: gospel.book_id,
        gospel: gospel.name,
        records_it: matching.length > 0,
        passages: matching,
      };
    });

    const compareNote = await this.events.getExplanation(
      event.event_id,
      languageCode,
      "compare",
    );

    return {
      event: toEventCard(event),
      accounts,
      shared_by: accounts.filter((a) => a.records_it).map((a) => a.gospel),
      note: compareNote?.content ?? "",
      note_provenance: compareNote?.provenance ?? null,
      parallel_confidence: event.parallel_confidence,
    };
  }

  /**
   * "View Jesus Event" — the bridge from ordinary reading.
   *
   * Called on the reader's hot path, so it returns compact cards only.
   */
  async getEventsForPassage(
    bookId: number,
    chapter: number,
    verse: number | undefined,
    languageCode = DEFAULT_LANGUAGE,
  ) {
    const events = await this.events.findEventsForPassage(
      bookId,
      chapter,
      verse,
      languageCode,
    );
    return { events: events.map((e) => toEventCard(e)) };
  }

  // ── Follow His Life ─────────────────────────────────────────────────────

  async getLife(languageCode = DEFAULT_LANGUAGE) {
    const periods = await this.taxonomy.getPeriods(languageCode);

    const withEvents = await Promise.all(
      periods.map(async (period) => {
        const events = await this.events.listEvents(
          { periodSlug: period.slug },
          { limit: 200, languageCode, orderBy: "chronology" },
        );
        return {
          slug: period.slug,
          name: period.name,
          subtitle: period.subtitle,
          description: period.description,
          sort_order: period.sort_order,
          event_count: events.length,
          events: events.map((e) => toEventCard(e)),
        };
      }),
    );

    return { periods: withEvents };
  }

  // ── Collections ─────────────────────────────────────────────────────────

  async getCollection(slug: string, languageCode = DEFAULT_LANGUAGE) {
    const collection = await this.taxonomy.getCollectionBySlug(
      slug,
      languageCode,
    );
    if (!collection) return null;

    const { events, total } = await this.listEvents(
      { collection: slug, limit: 200 },
      languageCode,
    );

    return {
      collection: {
        slug: collection.slug,
        name: collection.name,
        subtitle: collection.subtitle,
        description: collection.description,
        is_featured: collection.is_featured,
        sort_order: collection.sort_order,
        event_count: total,
      },
      events,
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async collectionMembership(collection: {
    collection_id: string;
    filter: unknown | null;
  }): Promise<{
    types?: JesusFacetType[];
    themeSlug?: string;
    eventIds?: string[];
  }> {
    const raw = collection.filter as
      | { kind?: string; kinds?: string[]; type?: string; theme?: string }
      | null
      | undefined;

    if (!raw || typeof raw !== "object") {
      return {
        eventIds: await this.events.getEventIdsForCollection(
          collection.collection_id,
        ),
      };
    }

    const list = raw.kinds ?? [raw.kind ?? raw.type].filter(Boolean);
    const types = list
      .map((k) => String(k).toUpperCase())
      .filter((k): k is JesusFacetType =>
        (JESUS_FACET_TYPES as readonly string[]).includes(k),
      );

    return { types: types.length ? types : undefined, themeSlug: raw.theme };
  }

  private async countCollectionEvents(collection: {
    collection_id: string;
    filter: unknown | null;
  }): Promise<number> {
    const membership = await this.collectionMembership(collection);
    return await this.events.countEvents({
      types: membership.types,
      themeSlug: membership.themeSlug,
      eventIds: membership.eventIds,
    });
  }

  /** Read the scripture behind each passage in the reader's own version. */
  private async hydratePassages(event: JesusEventRow, bibleVersion: string) {
    const version = await this.bible.getVersionBykey(bibleVersion);
    if (!version) return event.passages.map((p) => ({ ...p, verses: [] }));

    return await Promise.all(
      event.passages.map(async (passage) => {
        let verses: { verse_number: number; text: string }[] = [];

        if (passage.verse_start == null) {
          const result = await this.bible.getChapterVersesByBookNameAndChapter(
            passage.book_name,
            passage.chapter,
            version.id,
          );
          verses = (result.verses ?? []).map((v) => ({
            verse_number: v.verseNumber,
            text: v.text,
          }));
        } else {
          const end = passage.verse_end ?? passage.verse_start;
          const numbers = Array.from(
            { length: Math.max(end - passage.verse_start + 1, 1) },
            (_, i) => (passage.verse_start as number) + i,
          );
          const rows = await this.bible.getSpecificVersesByBookNameAndChapter(
            passage.book_name,
            passage.chapter,
            bibleVersion,
            numbers,
          );
          verses = rows
            .map((v) => ({ verse_number: v.verseNumber, text: v.text }))
            .sort((a, b) => a.verse_number - b.verse_number);
        }

        return { ...passage, verses };
      }),
    );
  }

  private async getExplanations(
    eventId: string,
    languageCode: string,
    bibleVersion?: string,
  ): Promise<Record<JesusEventExplanationType, string>> {
    const entries = await Promise.all(
      JESUS_EVENT_EXPLANATION_TYPES.map(async (type) => {
        let row = await this.events.getExplanation(eventId, languageCode, type);
        if (!row && languageCode !== FALLBACK_LANGUAGE) {
          row = await this.events.getExplanation(
            eventId,
            FALLBACK_LANGUAGE,
            type,
          );
        }
        let text = row?.content ?? "";
        if (text && bibleVersion) {
          text = await parseAndInjectVerses(text, bibleVersion, this.db, {
            includeVerseNumbers: false,
          });
        }
        return [type, text] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<
      JesusEventExplanationType,
      string
    >;
  }

  /** Events sharing themes, nearest in the timeline first. */
  private async getRelated(event: JesusEventRow, languageCode: string) {
    if (event.themes.length === 0) return [];
    const candidates = await this.events.listEvents(
      { themeSlug: event.themes[0].slug },
      { limit: 7, languageCode },
    );
    return candidates.filter((e) => e.event_id !== event.event_id).slice(0, 6);
  }
}

function pickChannel(
  rows: Array<{
    channel: string;
    content: string;
    source_ref: string | null;
    provenance: number;
  }>,
  channel: string,
) {
  return rows
    .filter((r) => r.channel === channel)
    .map((r) => ({
      content: r.content,
      source_ref: r.source_ref,
      provenance: r.provenance,
    }));
}

function toFacet(facet: {
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
}) {
  const meta = JESUS_FACET_META[facet.type as JesusFacetType];
  return {
    slug: facet.slug,
    mode: facet.mode,
    type: facet.type,
    type_slug: meta?.slug ?? facet.type.toLowerCase(),
    type_label: meta?.singular ?? facet.type,
    speaker: facet.speaker,
    actor: facet.actor,
    title: facet.title,
    text: facet.text,
    summary: facet.summary,
    provenance: facet.provenance,
    reference: facet.reference,
    book_id: facet.book_id,
    chapter: facet.chapter,
    verse_start: facet.verse_start,
    verse_end: facet.verse_end,
  };
}

/**
 * The card shape every event list returns.
 *
 * `matched_facets` is what makes a filtered list readable: browsing Questions
 * shows the storm event labelled with the question it contains, not just
 * "Calming the storm".
 */
function toEventCard(event: JesusEventRow, matchedTypes?: JesusFacetType[]) {
  const matched = matchedTypes?.length
    ? event.facets.filter((f) => (matchedTypes as string[]).includes(f.type))
    : [];

  return {
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    period_slug: event.period_slug,
    period_name: event.period_name,
    sequence: event.sequence,
    chronology_confidence: event.chronology_confidence,
    parallel_confidence: event.parallel_confidence,
    gospels: event.passages.map((p) => p.book_name),
    passages: event.passages.map((p) => ({
      book_id: p.book_id,
      book_name: p.book_name,
      chapter: p.chapter,
      verse_start: p.verse_start,
      verse_end: p.verse_end,
      is_primary: p.is_primary,
      display: p.display,
    })),
    facet_counts: countFacets(event.facets),
    matched_facets: matched.map(toFacet),
    themes: event.themes,
  };
}

function countFacets(facets: Array<{ mode: string; type: string }>) {
  const counts: Record<string, number> = {};
  for (const facet of facets)
    counts[facet.type] = (counts[facet.type] ?? 0) + 1;
  return {
    words: facets.filter((f) => f.mode === "WORD").length,
    actions: facets.filter((f) => f.mode === "ACTION").length,
    by_type: counts,
  };
}
