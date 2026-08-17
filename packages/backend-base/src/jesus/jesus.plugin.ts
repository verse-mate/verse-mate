import { Elysia, t } from "elysia";
import { authDerive } from "../auth/auth.utils";
import shared from "../shared/shared.plugin";
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

// ── Plugin ────────────────────────────────────────────────────────────────

const plugin = new Elysia()
  .use(shared)
  .state((state) => ({
    ...state,
    jesusService: new JesusService(state.db),
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
      ),
  );

export type JesusPlugin = typeof plugin;

export default plugin;
