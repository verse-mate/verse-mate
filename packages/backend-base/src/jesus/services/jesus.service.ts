import { BibleRepository } from "../../bible/repository/bible.repository";
import type { db } from "../../shared/shared.plugin";
import { parseAndInjectVerses } from "../../shared/verse-parser";
import {
  JESUS_EXPLANATION_TYPES,
  JESUS_KINDS,
  JESUS_KIND_META,
  JESUS_SECTIONS,
  JESUS_SECTION_META,
  type JesusExplanationType,
  type JesusKind,
  resolveKindFilter,
} from "../jesus.constants";
import {
  type JesusEntryFilter,
  type JesusEntryRow,
  JesusRepository,
} from "../repository/jesus.repository";

const DEFAULT_LANGUAGE = "en-US";
const FALLBACK_LANGUAGE = "en-US";

/** One verse of a passage rendered inline on the entry detail screen. */
export interface JesusPassageVerse {
  verse_number: number;
  text: string;
}

export interface JesusPassage {
  reference: string;
  book_id: number;
  book_name: string;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  is_primary: boolean;
  verses: JesusPassageVerse[];
}

/**
 * Business logic for the Jesus feature.
 *
 * The service owns three things the repository deliberately doesn't:
 * resolving a collection's membership (dynamic filter vs. curated list),
 * language fallback for explanations, and hydrating structured references into
 * actual scripture text in the reader's chosen Bible version.
 */
export class JesusService {
  private jesusRepository: JesusRepository;
  private bibleRepository: BibleRepository;

  constructor(private readonly db: db) {
    this.jesusRepository = new JesusRepository(this.db);
    this.bibleRepository = new BibleRepository(this.db);
  }

  // ── Hub ─────────────────────────────────────────────────────────────────

  /**
   * The entire navigational skeleton of the Jesus tab in one request.
   *
   * Clients render the hub from this payload rather than hardcoding section
   * names and kind labels, which is what lets web and mobile stay in step when
   * the taxonomy changes — and lets a new kind ship without a client release.
   */
  async getOverview(languageCode = DEFAULT_LANGUAGE) {
    const [kindCounts, themes, collections, periods, totalEntries] =
      await Promise.all([
        this.jesusRepository.getKindCounts(),
        this.jesusRepository.getThemes(languageCode),
        this.jesusRepository.getCollections(languageCode, {
          featuredOnly: true,
        }),
        this.jesusRepository.getPeriods(languageCode),
        this.jesusRepository.countEntries(),
      ]);

    const sections = JESUS_SECTIONS.map((section) => {
      const meta = JESUS_SECTION_META[section];
      const kinds = meta.kinds.map((kind) => ({
        kind,
        slug: JESUS_KIND_META[kind].slug,
        label: JESUS_KIND_META[kind].label,
        singular: JESUS_KIND_META[kind].singular,
        blurb: JESUS_KIND_META[kind].blurb,
        entry_count: kindCounts[kind] ?? 0,
      }));

      return {
        section,
        label: meta.label,
        blurb: meta.blurb,
        sort_order: meta.sortOrder,
        entry_count: kinds.reduce((sum, k) => sum + k.entry_count, 0),
        kinds,
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
        entry_count: await this.countCollectionEntries(collection),
      })),
    );

    return {
      total_entries: totalEntries,
      sections,
      periods: periods.map((p) => ({
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        description: p.description,
        sort_order: p.sort_order,
        entry_count: p.entry_count,
      })),
      themes: themes.map((t) => ({
        slug: t.slug,
        name: t.name,
        description: t.description,
        sort_order: t.sort_order,
        entry_count: t.entry_count,
      })),
      collections: collectionsWithCounts,
    };
  }

  // ── Entries ─────────────────────────────────────────────────────────────

  async listEntries(
    params: {
      kind?: string;
      section?: string;
      theme?: string;
      period?: string;
      collection?: string;
      book_id?: number;
      q?: string;
      limit?: number;
      offset?: number;
    },
    languageCode = DEFAULT_LANGUAGE,
  ) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);

    const filter: JesusEntryFilter = {
      kinds: resolveKindFilter(params),
      themeSlug: params.theme,
      periodSlug: params.period,
      bookId: params.book_id,
      search: params.q,
    };

    // A collection narrows the same query rather than replacing it, so
    // "questions inside the Jesus-and-the-Pharisees study" works.
    if (params.collection) {
      const collection = await this.jesusRepository.getCollectionBySlug(
        params.collection,
        languageCode,
      );
      if (!collection) {
        return { entries: [], total: 0, limit, offset };
      }
      const membership = this.collectionFilter(collection);
      if (membership.entryIds) filter.entryIds = await membership.entryIds;
      if (membership.kinds) {
        // Intersect rather than overwrite so an explicit ?kind= still applies.
        filter.kinds = filter.kinds
          ? filter.kinds.filter((k) => membership.kinds?.includes(k))
          : membership.kinds;
      }
      if (membership.themeSlug && !filter.themeSlug) {
        filter.themeSlug = membership.themeSlug;
      }
      if (membership.bookId && !filter.bookId)
        filter.bookId = membership.bookId;
    }

    const [entries, total] = await Promise.all([
      this.jesusRepository.listEntries(filter, {
        languageCode,
        limit,
        offset,
        orderBy: params.period ? "chronology" : "default",
      }),
      this.jesusRepository.countEntries(filter),
    ]);

    return { entries: entries.map(toEntryCard), total, limit, offset };
  }

  /**
   * Full detail for one entry: its passages in the reader's Bible version, the
   * three AI explanation variants, and what to read next.
   */
  async getEntryDetail(
    slug: string,
    languageCode = DEFAULT_LANGUAGE,
    bibleVersion?: string,
  ) {
    const entry = await this.jesusRepository.getEntryBySlug(slug, languageCode);
    if (!entry) return null;

    const [passages, explanation, relatedIds] = await Promise.all([
      bibleVersion
        ? this.getPassages(entry, bibleVersion)
        : Promise.resolve([] as JesusPassage[]),
      this.getEntryExplanations(entry.entry_id, languageCode, bibleVersion),
      this.jesusRepository.getRelatedEntryIds(entry.entry_id, 6),
    ]);

    const related = await this.jesusRepository.getEntriesByIds(
      relatedIds,
      languageCode,
    );

    return {
      entry: {
        ...toEntryCard(entry),
        harmony_key: entry.harmony_key,
        chronology_order: entry.chronology_order,
      },
      passages,
      explanation,
      related: related.map(toEntryCard),
    };
  }

  // ── Follow His Life ─────────────────────────────────────────────────────

  /**
   * The chronological walk. Periods always come back — even empty ones — so the
   * timeline reads as a complete arc rather than skipping a stretch of the
   * ministry that simply has no entries curated yet.
   */
  async getLife(
    languageCode = DEFAULT_LANGUAGE,
    options: { entriesPerPeriod?: number } = {},
  ) {
    const entriesPerPeriod = options.entriesPerPeriod ?? 200;
    const periods = await this.jesusRepository.getPeriods(languageCode);

    const withEntries = await Promise.all(
      periods.map(async (period) => {
        const entries = await this.jesusRepository.listEntries(
          { periodSlug: period.slug },
          { languageCode, limit: entriesPerPeriod, orderBy: "chronology" },
        );
        return {
          slug: period.slug,
          name: period.name,
          subtitle: period.subtitle,
          description: period.description,
          sort_order: period.sort_order,
          entry_count: period.entry_count,
          entries: entries.map(toEntryCard),
        };
      }),
    );

    return { periods: withEntries };
  }

  // ── Taxonomy ────────────────────────────────────────────────────────────

  async getThemes(languageCode = DEFAULT_LANGUAGE) {
    const themes = await this.jesusRepository.getThemes(languageCode);
    return themes.map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      sort_order: t.sort_order,
      entry_count: t.entry_count,
    }));
  }

  async getCollections(languageCode = DEFAULT_LANGUAGE) {
    const collections = await this.jesusRepository.getCollections(languageCode);
    return await Promise.all(
      collections.map(async (c) => ({
        slug: c.slug,
        name: c.name,
        subtitle: c.subtitle,
        description: c.description,
        is_featured: c.is_featured,
        sort_order: c.sort_order,
        entry_count: await this.countCollectionEntries(c),
      })),
    );
  }

  async getCollectionDetail(slug: string, languageCode = DEFAULT_LANGUAGE) {
    const collection = await this.jesusRepository.getCollectionBySlug(
      slug,
      languageCode,
    );
    if (!collection) return null;

    const { entries, total } = await this.listEntries(
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
        entry_count: total,
      },
      entries,
    };
  }

  // ── Explanations ────────────────────────────────────────────────────────

  /**
   * Fetch summary / by-line / detailed for an entry, falling back to English
   * when the requested language hasn't been generated yet, and resolving
   * `{verse:…}` placeholders against the reader's Bible version — identical
   * semantics to the topics feature so the two read the same to users.
   */
  async getEntryExplanations(
    entryId: string,
    languageCode = DEFAULT_LANGUAGE,
    bibleVersion?: string,
  ): Promise<Record<JesusExplanationType, string>> {
    const results = await Promise.all(
      JESUS_EXPLANATION_TYPES.map(async (type) => {
        let row = await this.jesusRepository.getEntryExplanation(
          entryId,
          languageCode,
          type,
        );

        if (!row && languageCode !== FALLBACK_LANGUAGE) {
          row = await this.jesusRepository.getEntryExplanation(
            entryId,
            FALLBACK_LANGUAGE,
            type,
          );
        }

        let text = row?.explanation ?? "";
        if (text && bibleVersion) {
          text = await parseAndInjectVerses(text, bibleVersion, this.db, {
            includeVerseNumbers: false,
          });
        }
        return [type, text] as const;
      }),
    );

    return Object.fromEntries(results) as Record<JesusExplanationType, string>;
  }

  async saveEntryExplanation(
    entryId: string,
    explanation: string,
    languageCode: string,
    type: string,
  ) {
    if (!(JESUS_EXPLANATION_TYPES as readonly string[]).includes(type)) {
      throw new Error(
        `Invalid explanation type: ${type}. Must be one of: ${JESUS_EXPLANATION_TYPES.join(", ")}`,
      );
    }
    if (!explanation.trim()) {
      throw new Error("Explanation content cannot be empty");
    }
    await this.jesusRepository.saveEntryExplanation(
      entryId,
      explanation,
      languageCode,
      type,
    );
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /**
   * Turn a collection's stored `filter` jsonb into repository filter fields.
   * A collection with no filter is hand-curated, so its membership comes from
   * the ordered join table instead.
   */
  private collectionFilter(collection: {
    collection_id: string;
    filter: unknown | null;
  }): {
    kinds?: JesusKind[];
    themeSlug?: string;
    bookId?: number;
    entryIds?: Promise<string[]>;
  } {
    const raw = collection.filter as
      | { kind?: string; kinds?: string[]; theme?: string; book_id?: number }
      | null
      | undefined;

    if (!raw || typeof raw !== "object") {
      return {
        entryIds: this.jesusRepository.getCollectionMemberIds(
          collection.collection_id,
        ),
      };
    }

    const kindList = raw.kinds ?? (raw.kind ? [raw.kind] : []);
    const kinds = kindList
      .map((k) => k.toUpperCase())
      .filter((k): k is JesusKind =>
        (JESUS_KINDS as readonly string[]).includes(k),
      );

    return {
      kinds: kinds.length ? kinds : undefined,
      themeSlug: raw.theme,
      bookId: raw.book_id,
    };
  }

  private async countCollectionEntries(collection: {
    collection_id: string;
    filter: unknown | null;
  }): Promise<number> {
    const membership = this.collectionFilter(collection);
    return await this.jesusRepository.countEntries({
      kinds: membership.kinds,
      themeSlug: membership.themeSlug,
      bookId: membership.bookId,
      entryIds: membership.entryIds ? await membership.entryIds : undefined,
    });
  }

  /**
   * Read the actual scripture behind an entry's references so the detail screen
   * can show the passage inline instead of only a link out to the reader.
   */
  private async getPassages(
    entry: JesusEntryRow,
    bibleVersion: string,
  ): Promise<JesusPassage[]> {
    const version = await this.bibleRepository.getVersionBykey(bibleVersion);
    if (!version) return [];

    return await Promise.all(
      entry.references.map(async (ref) => {
        let verses: JesusPassageVerse[] = [];

        if (ref.verse_start == null) {
          // Whole-chapter reference.
          const result =
            await this.bibleRepository.getChapterVersesByBookNameAndChapter(
              ref.book_name,
              ref.chapter,
              version.id,
            );
          verses = (result.verses ?? []).map((v) => ({
            verse_number: v.verseNumber,
            text: v.text,
          }));
        } else {
          const end = ref.verse_end ?? ref.verse_start;
          const verseNumbers = Array.from(
            { length: Math.max(end - ref.verse_start + 1, 1) },
            (_, i) => (ref.verse_start as number) + i,
          );
          const rows =
            await this.bibleRepository.getSpecificVersesByBookNameAndChapter(
              ref.book_name,
              ref.chapter,
              bibleVersion,
              verseNumbers,
            );
          verses = rows
            .map((v) => ({ verse_number: v.verseNumber, text: v.text }))
            .sort((a, b) => a.verse_number - b.verse_number);
        }

        return {
          reference: ref.display,
          book_id: ref.book_id,
          book_name: ref.book_name,
          chapter: ref.chapter,
          verse_start: ref.verse_start,
          verse_end: ref.verse_end,
          is_primary: ref.is_primary,
          verses,
        };
      }),
    );
  }
}

/**
 * The wire shape of an entry card. Kept in one place because every list
 * endpoint returns it and both clients render it with a single component.
 */
function toEntryCard(entry: JesusEntryRow) {
  const meta = JESUS_KIND_META[entry.kind as JesusKind];
  return {
    slug: entry.slug,
    kind: entry.kind,
    kind_slug: meta?.slug ?? entry.kind.toLowerCase(),
    kind_label: meta?.singular ?? entry.kind,
    section: meta?.section ?? null,
    title: entry.title,
    summary: entry.summary,
    quote: entry.quote,
    quote_reference: entry.quote_reference,
    period_slug: entry.period_slug,
    period_name: entry.period_name,
    is_translated: entry.is_translated,
    references: entry.references.map((r) => ({
      book_id: r.book_id,
      book_name: r.book_name,
      chapter: r.chapter,
      verse_start: r.verse_start,
      verse_end: r.verse_end,
      is_primary: r.is_primary,
      display: r.display,
    })),
    themes: entry.themes.map((t) => ({ slug: t.slug, name: t.name })),
  };
}
