import { Elysia, t } from "elysia";
import { authDerive } from "../auth/auth.utils";
import shared from "../shared/shared.plugin";
import { JesusEventService } from "./services/jesus-event.service";
import { JesusService } from "./services/jesus.service";
import { resolveLanguage } from "./utils/language.utils";

// ── Response schemas ──────────────────────────────────────────────────────

const ReferenceSchema = t.Object({
  book_id: t.Number(),
  book_name: t.String(),
  chapter: t.Number(),
  verse_start: t.Union([t.Number(), t.Null()]),
  verse_end: t.Union([t.Number(), t.Null()]),
  is_primary: t.Boolean(),
  display: t.String(),
});

const ThemeRefSchema = t.Object({
  slug: t.String(),
  name: t.String(),
});

const EntryCardSchema = t.Object({
  slug: t.String(),
  kind: t.String(),
  kind_slug: t.String(),
  kind_label: t.String(),
  section: t.Union([t.String(), t.Null()]),
  title: t.String(),
  summary: t.Union([t.String(), t.Null()]),
  quote: t.Union([t.String(), t.Null()]),
  quote_reference: t.Union([t.String(), t.Null()]),
  period_slug: t.Union([t.String(), t.Null()]),
  period_name: t.Union([t.String(), t.Null()]),
  is_translated: t.Boolean(),
  references: t.Array(ReferenceSchema),
  themes: t.Array(ThemeRefSchema),
});

const KindSchema = t.Object({
  kind: t.String(),
  slug: t.String(),
  label: t.String(),
  singular: t.String(),
  blurb: t.String(),
  entry_count: t.Number(),
});

const SectionSchema = t.Object({
  section: t.String(),
  label: t.String(),
  blurb: t.String(),
  sort_order: t.Number(),
  entry_count: t.Number(),
  kinds: t.Array(KindSchema),
});

const PeriodSummarySchema = t.Object({
  slug: t.String(),
  name: t.String(),
  subtitle: t.Union([t.String(), t.Null()]),
  description: t.Union([t.String(), t.Null()]),
  sort_order: t.Number(),
  entry_count: t.Number(),
});

const ThemeSummarySchema = t.Object({
  slug: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  sort_order: t.Number(),
  entry_count: t.Number(),
});

const CollectionSummarySchema = t.Object({
  slug: t.String(),
  name: t.String(),
  subtitle: t.Union([t.String(), t.Null()]),
  description: t.Union([t.String(), t.Null()]),
  is_featured: t.Optional(t.Boolean()),
  sort_order: t.Number(),
  entry_count: t.Number(),
});

const OverviewResponseSchema = t.Object({
  total_entries: t.Number(),
  sections: t.Array(SectionSchema),
  periods: t.Array(PeriodSummarySchema),
  themes: t.Array(ThemeSummarySchema),
  collections: t.Array(CollectionSummarySchema),
});

const EntryListResponseSchema = t.Object({
  entries: t.Array(EntryCardSchema),
  total: t.Number(),
  limit: t.Number(),
  offset: t.Number(),
});

const PassageSchema = t.Object({
  reference: t.String(),
  book_id: t.Number(),
  book_name: t.String(),
  chapter: t.Number(),
  verse_start: t.Union([t.Number(), t.Null()]),
  verse_end: t.Union([t.Number(), t.Null()]),
  is_primary: t.Boolean(),
  verses: t.Array(
    t.Object({
      verse_number: t.Number(),
      text: t.String(),
    }),
  ),
});

const EntryDetailResponseSchema = t.Object({
  entry: t.Intersect([
    EntryCardSchema,
    t.Object({
      harmony_key: t.Union([t.String(), t.Null()]),
      chronology_order: t.Union([t.Number(), t.Null()]),
    }),
  ]),
  passages: t.Array(PassageSchema),
  explanation: t.Object({
    summary: t.String(),
    byline: t.String(),
    detailed: t.String(),
  }),
  related: t.Array(EntryCardSchema),
});

const LifeResponseSchema = t.Object({
  periods: t.Array(
    t.Intersect([
      PeriodSummarySchema,
      t.Object({ entries: t.Array(EntryCardSchema) }),
    ]),
  ),
});

const ThemesResponseSchema = t.Object({
  themes: t.Array(ThemeSummarySchema),
});

const CollectionsResponseSchema = t.Object({
  collections: t.Array(CollectionSummarySchema),
});

const CollectionDetailResponseSchema = t.Object({
  collection: CollectionSummarySchema,
  entries: t.Array(EntryCardSchema),
});

const ErrorSchema = t.Object({ error: t.String() });

// ── Event graph schemas ───────────────────────────────────────────────────
//
// Responses are deliberately loose on the generated/structured extras
// (`t.Any()` for nested lists whose shape the content pipeline still owns) so
// adding a field to a reveal or a reaction doesn't require a schema migration
// in lockstep. The event card itself is pinned, because both clients render it.

const EventPassageSchema = t.Object({
  book_id: t.Number(),
  book_name: t.String(),
  chapter: t.Number(),
  verse_start: t.Union([t.Number(), t.Null()]),
  verse_end: t.Union([t.Number(), t.Null()]),
  is_primary: t.Boolean(),
  display: t.String(),
});

const FacetSchema = t.Object({
  slug: t.String(),
  mode: t.String(),
  type: t.String(),
  type_slug: t.String(),
  type_label: t.String(),
  speaker: t.Union([t.String(), t.Null()]),
  actor: t.Union([t.String(), t.Null()]),
  title: t.String(),
  text: t.Union([t.String(), t.Null()]),
  summary: t.Union([t.String(), t.Null()]),
  provenance: t.Number(),
  reference: t.Union([t.String(), t.Null()]),
  book_id: t.Union([t.Number(), t.Null()]),
  chapter: t.Union([t.Number(), t.Null()]),
  verse_start: t.Union([t.Number(), t.Null()]),
  verse_end: t.Union([t.Number(), t.Null()]),
});

const EventCardSchema = t.Object({
  slug: t.String(),
  title: t.String(),
  summary: t.Union([t.String(), t.Null()]),
  period_slug: t.Union([t.String(), t.Null()]),
  period_name: t.Union([t.String(), t.Null()]),
  sequence: t.Union([t.Number(), t.Null()]),
  chronology_confidence: t.String(),
  parallel_confidence: t.String(),
  gospels: t.Array(t.String()),
  passages: t.Array(EventPassageSchema),
  facet_counts: t.Object({
    words: t.Number(),
    actions: t.Number(),
    by_type: t.Record(t.String(), t.Number()),
  }),
  matched_facets: t.Array(FacetSchema),
  themes: t.Array(ThemeRefSchema),
});

const EventListResponseSchema = t.Object({
  events: t.Array(EventCardSchema),
  total: t.Number(),
  limit: t.Number(),
  offset: t.Number(),
});

const EventDetailResponseSchema = t.Object({
  event: t.Any(),
  words: t.Array(FacetSchema),
  actions: t.Array(FacetSchema),
  passages: t.Array(t.Any()),
  reveals: t.Object({
    says_about_himself: t.Array(t.Any()),
    demonstrates: t.Array(t.Any()),
    others_say: t.Array(t.Any()),
    narrator_says: t.Array(t.Any()),
  }),
  reactions: t.Array(t.Any()),
  explanation: t.Record(t.String(), t.String()),
  related: t.Array(EventCardSchema),
});

const CompareResponseSchema = t.Object({
  event: EventCardSchema,
  accounts: t.Array(t.Any()),
  shared_by: t.Array(t.String()),
  note: t.String(),
  note_provenance: t.Union([t.Number(), t.Null()]),
  parallel_confidence: t.String(),
});

const EventOverviewResponseSchema = t.Object({
  total_events: t.Number(),
  total_facets: t.Number(),
  sections: t.Array(t.Any()),
  periods: t.Array(t.Any()),
  themes: t.Array(t.Any()),
  collections: t.Array(t.Any()),
});

const ForPassageResponseSchema = t.Object({
  events: t.Array(EventCardSchema),
});

const EventLifeResponseSchema = t.Object({ periods: t.Array(t.Any()) });

const EventCollectionResponseSchema = t.Object({
  collection: t.Any(),
  events: t.Array(EventCardSchema),
});

// ── Plugin ────────────────────────────────────────────────────────────────

const plugin = new Elysia()
  .use(shared)
  .state((state) => ({
    ...state,
    jesusService: new JesusService(state.db),
    jesusEventService: new JesusEventService(state.db),
  }))
  .group("/jesus", (app) =>
    app
      // Content is public — `authDerive` only surfaces `currentUserId` when a
      // token happens to be present, so a signed-in reader gets their preferred
      // language while anonymous readers still get the whole feature.
      .resolve({ as: "scoped" }, authDerive)
      .get(
        "/overview",
        async ({ query, store: { jesusService, db }, currentUserId }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          return await jesusService.getOverview(languageCode);
        },
        {
          query: t.Object({
            bible_version: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Jesus"],
            summary: "Jesus tab hub",
            description:
              "The full navigational skeleton — sections, kinds with counts, life periods, themes and featured studies. Clients render the hub from this payload instead of hardcoding the taxonomy.",
          },
          response: OverviewResponseSchema,
        },
      )
      .get(
        "/entries",
        async ({ query, store: { jesusService, db }, currentUserId }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          return await jesusService.listEntries(query, languageCode);
        },
        {
          query: t.Object({
            kind: t.Optional(t.String()),
            section: t.Optional(t.String()),
            theme: t.Optional(t.String()),
            period: t.Optional(t.String()),
            collection: t.Optional(t.String()),
            book_id: t.Optional(t.Numeric()),
            q: t.Optional(t.String()),
            limit: t.Optional(t.Numeric()),
            offset: t.Optional(t.Numeric()),
            bible_version: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Jesus"],
            summary: "Browse entries",
            description:
              "Paginated entry cards. All filters are AND-ed, so /jesus/entries?kind=question&theme=prayer is 'every question Jesus asked about prayer'.",
          },
          response: EntryListResponseSchema,
        },
      )
      .get(
        "/entries/:slug",
        async ({
          params,
          query,
          store: { jesusService, db },
          currentUserId,
          set,
        }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          const detail = await jesusService.getEntryDetail(
            params.slug,
            languageCode,
            query.bible_version,
          );
          if (!detail) {
            set.status = 404;
            return { error: "Entry not found" };
          }
          return detail;
        },
        {
          params: t.Object({ slug: t.String() }),
          query: t.Object({
            bible_version: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Jesus"],
            summary: "Entry detail",
            description:
              "One entry with its passages resolved into the requested Bible version, the three explanation variants, and related entries.",
          },
          response: {
            200: EntryDetailResponseSchema,
            404: ErrorSchema,
          },
        },
      )
      .get(
        "/life",
        async ({ query, store: { jesusService, db }, currentUserId }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          return await jesusService.getLife(languageCode);
        },
        {
          query: t.Object({
            bible_version: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Jesus"],
            summary: "Follow His Life",
            description:
              "The chronological walk through the ministry, grouped by period. Empty periods are included so the timeline reads as a complete arc.",
          },
          response: LifeResponseSchema,
        },
      )
      .get(
        "/themes",
        async ({ query, store: { jesusService, db }, currentUserId }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          return { themes: await jesusService.getThemes(languageCode) };
        },
        {
          query: t.Object({
            bible_version: t.Optional(t.String()),
          }),
          detail: { tags: ["Jesus"], summary: "Explore by topic" },
          response: ThemesResponseSchema,
        },
      )
      .get(
        "/collections",
        async ({ query, store: { jesusService, db }, currentUserId }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          return {
            collections: await jesusService.getCollections(languageCode),
          };
        },
        {
          query: t.Object({
            bible_version: t.Optional(t.String()),
          }),
          detail: { tags: ["Jesus"], summary: "Popular studies" },
          response: CollectionsResponseSchema,
        },
      )
      .get(
        "/collections/:slug",
        async ({
          params,
          query,
          store: { jesusService, db },
          currentUserId,
          set,
        }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          const detail = await jesusService.getCollectionDetail(
            params.slug,
            languageCode,
          );
          if (!detail) {
            set.status = 404;
            return { error: "Collection not found" };
          }
          return detail;
        },
        {
          params: t.Object({ slug: t.String() }),
          query: t.Object({
            bible_version: t.Optional(t.String()),
          }),
          detail: { tags: ["Jesus"], summary: "One study, with its entries" },
          response: {
            200: CollectionDetailResponseSchema,
            404: ErrorSchema,
          },
        },
      )

      // ══ Event graph ══════════════════════════════════════════════════════
      //
      // The routes above are the superseded entry model. They stay until the
      // clients move across, then go. See specs/jesus-event-graph.md.

      .get(
        "/for-passage",
        async ({ query, store: { jesusEventService, db }, currentUserId }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          return await jesusEventService.getEventsForPassage(
            query.book_id,
            query.chapter,
            query.verse,
            languageCode,
          );
        },
        {
          query: t.Object({
            book_id: t.Numeric(),
            chapter: t.Numeric(),
            verse: t.Optional(t.Numeric()),
            bible_version: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Jesus"],
            summary: "Events covering a passage",
            description:
              "The bridge from ordinary reading — given a verse, the Gospel event(s) that cover it, with their parallel accounts. Called on the reader's hot path, so it returns compact cards only.",
          },
          response: ForPassageResponseSchema,
        },
      )
      .get(
        "/events",
        async ({ query, store: { jesusEventService, db }, currentUserId }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          return await jesusEventService.listEvents(query, languageCode);
        },
        {
          query: t.Object({
            type: t.Optional(t.String()),
            section: t.Optional(t.String()),
            mode: t.Optional(t.String()),
            theme: t.Optional(t.String()),
            period: t.Optional(t.String()),
            collection: t.Optional(t.String()),
            person: t.Optional(t.String()),
            book_id: t.Optional(t.Numeric()),
            q: t.Optional(t.String()),
            limit: t.Optional(t.Numeric()),
            offset: t.Optional(t.Numeric()),
            bible_version: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Jesus"],
            summary: "Browse events",
            description:
              "Every category is a view over the graph: ?type=questions is 'every question Jesus asked', ?section=actions is everything He did. Filters are AND-ed.",
          },
          response: EventListResponseSchema,
        },
      )
      .get(
        "/events/overview",
        async ({ query, store: { jesusEventService, db }, currentUserId }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          return await jesusEventService.getOverview(languageCode);
        },
        {
          query: t.Object({ bible_version: t.Optional(t.String()) }),
          detail: {
            tags: ["Jesus"],
            summary: "Hub skeleton (event graph)",
            description:
              "Sections, facet types with counts, periods, themes and featured studies. Clients render the hub from this rather than hardcoding the taxonomy.",
          },
          response: EventOverviewResponseSchema,
        },
      )
      .get(
        "/events/life",
        async ({ query, store: { jesusEventService, db }, currentUserId }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          return await jesusEventService.getLife(languageCode);
        },
        {
          query: t.Object({ bible_version: t.Optional(t.String()) }),
          detail: {
            tags: ["Jesus"],
            summary: "Follow His Life (event graph)",
            description:
              "The chronological walk. Each event carries its own chronology confidence, since a harmonized sequence is a reconstruction rather than something scripture specifies.",
          },
          response: EventLifeResponseSchema,
        },
      )
      .get(
        "/events/collections/:slug",
        async ({
          params,
          query,
          store: { jesusEventService, db },
          currentUserId,
          set,
        }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          const detail = await jesusEventService.getCollection(
            params.slug,
            languageCode,
          );
          if (!detail) {
            set.status = 404;
            return { error: "Collection not found" };
          }
          return detail;
        },
        {
          params: t.Object({ slug: t.String() }),
          query: t.Object({ bible_version: t.Optional(t.String()) }),
          detail: { tags: ["Jesus"], summary: "One study, as events" },
          response: {
            200: EventCollectionResponseSchema,
            404: ErrorSchema,
          },
        },
      )
      .get(
        "/events/:slug/compare",
        async ({
          params,
          query,
          store: { jesusEventService, db },
          currentUserId,
          set,
        }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          const compare = await jesusEventService.getCompare(
            params.slug,
            languageCode,
            query.bible_version,
          );
          if (!compare) {
            set.status = 404;
            return { error: "Event not found" };
          }
          return compare;
        },
        {
          params: t.Object({ slug: t.String() }),
          query: t.Object({ bible_version: t.Optional(t.String()) }),
          detail: {
            tags: ["Jesus"],
            summary: "Four-Gospel synopsis",
            description:
              "One column per Gospel, assembled from stored data — never generated by a model at request time. Accounts that do not record the event come back marked absent so the client can grey the column rather than hide it.",
          },
          response: {
            200: CompareResponseSchema,
            404: ErrorSchema,
          },
        },
      )
      .get(
        "/events/:slug",
        async ({
          params,
          query,
          store: { jesusEventService, db },
          currentUserId,
          set,
        }) => {
          const languageCode = await resolveLanguage(db, {
            bibleVersion: query.bible_version,
            currentUserId,
          });
          const detail = await jesusEventService.getEvent(
            params.slug,
            languageCode,
            query.bible_version,
          );
          if (!detail) {
            set.status = 404;
            return { error: "Event not found" };
          }
          return detail;
        },
        {
          params: t.Object({ slug: t.String() }),
          query: t.Object({ bible_version: t.Optional(t.String()) }),
          detail: {
            tags: ["Jesus"],
            summary: "One event in full",
            description:
              "Words and actions split for the tabs, passages in the requested Bible version, what the event reveals by channel, reactions, and generated narrative. Also resolves a legacy entry slug, so old /jesus/entry/<slug> links keep working.",
          },
          response: {
            200: EventDetailResponseSchema,
            404: ErrorSchema,
          },
        },
      ),
  );

export type JesusPlugin = typeof plugin;

export default plugin;
