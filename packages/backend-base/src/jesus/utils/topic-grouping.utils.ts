/**
 * Turning a flat category list into a topic-led one.
 *
 * A browse screen that answers "what did He teach?" with 29 undifferentiated
 * cards makes the reader do the synthesis. Grouping the same events under the
 * themes they belong to lets the screen say what each topic is about first, and
 * only then show the examples — so the taxonomy the corpus already carries does
 * some work for the reader instead of only for the filter.
 *
 * The grouping is pure so it can be tested without a database: the service
 * hands it cards it has already built and the themes it has already read.
 */

/** Just enough of a facet for grouping. Matches the service's card facets. */
export interface GroupableFacet {
  slug: string;
  title: string;
  text: string | null;
  summary: string | null;
  reference: string | null;
  provenance: number;
}

/** Just enough of an event card for grouping. */
export interface GroupableEvent {
  slug: string;
  title: string;
  matched_facets: GroupableFacet[];
  passages: { book_name: string }[];
  themes: { slug: string; name: string }[];
}

export interface GroupableTheme {
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
}

/** One line of "what He says here", lifted from a matched facet. */
export interface JesusTopicPoint {
  slug: string;
  title: string;
  text: string | null;
  summary: string | null;
  reference: string | null;
  provenance: number;
}

export interface JesusTopicGroup<TEvent> {
  /** null on the catch-all group for events carrying no theme. */
  slug: string | null;
  name: string;
  description: string | null;
  sort_order: number;
  event_count: number;
  /** Matched facets of the browsed type inside this topic. */
  facet_count: number;
  /** Gospels covering the topic, in canonical order. */
  gospels: string[];
  points: JesusTopicPoint[];
  events: TEvent[];
}

/** How many "what He says here" lines a topic shows before the cards. */
export const TOPIC_POINT_LIMIT = 5;

const UNTAGGED_NAME = "Other";
const UNTAGGED_DESCRIPTION = "Not gathered under a topic yet.";

const GOSPEL_ORDER = ["Matthew", "Mark", "Luke", "John"];

/**
 * Group events under their topics, one topic per event.
 *
 * An event tagged both `kingdom` and `faith` lands under `kingdom` alone — its
 * first theme. Listing it twice would make the topic counts sum past the
 * category total and make the screen read as longer than it is; the card still
 * carries its full `themes` array, so the UI can cross-link the rest.
 *
 * Topics with no events are dropped: a category is not obliged to touch every
 * theme, and an empty "Money" heading under Prayers is noise. Order follows the
 * theme sort order, with the untagged catch-all last.
 */
export function groupEventsByTopic<TEvent extends GroupableEvent>(
  events: TEvent[],
  themes: GroupableTheme[],
): JesusTopicGroup<TEvent>[] {
  const known = new Map(themes.map((theme) => [theme.slug, theme]));
  const buckets = new Map<string | null, TEvent[]>();

  for (const event of events) {
    const primary = event.themes.find((theme) => known.has(theme.slug));
    const key = primary?.slug ?? null;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(event);
    else buckets.set(key, [event]);
  }

  const groups: JesusTopicGroup<TEvent>[] = [];

  for (const theme of [...themes].sort((a, b) => a.sort_order - b.sort_order)) {
    const bucket = buckets.get(theme.slug);
    if (!bucket?.length) continue;
    groups.push(buildGroup(theme, bucket));
  }

  const untagged = buckets.get(null);
  if (untagged?.length) {
    groups.push(
      buildGroup(
        {
          slug: null,
          name: UNTAGGED_NAME,
          description: UNTAGGED_DESCRIPTION,
          // Sorts after every real theme without competing with them.
          sort_order: Number.MAX_SAFE_INTEGER,
        },
        untagged,
      ),
    );
  }

  return groups;
}

function buildGroup<TEvent extends GroupableEvent>(
  theme: Omit<GroupableTheme, "slug"> & { slug: string | null },
  events: TEvent[],
): JesusTopicGroup<TEvent> {
  const facets = events.flatMap((event) => event.matched_facets);

  return {
    slug: theme.slug,
    name: theme.name,
    description: theme.description,
    sort_order: theme.sort_order,
    event_count: events.length,
    facet_count: facets.length,
    gospels: orderGospels(
      events.flatMap((event) => event.passages.map((p) => p.book_name)),
    ),
    points: pickPoints(facets),
    events,
  };
}

/**
 * The topic's headline sayings.
 *
 * Deduped on the title because parallel accounts of one saying are separate
 * facets — the Sermon on the Mount and its Lukan parallel should not both
 * appear as bullets under Kingdom. Facets carrying His actual words sort first:
 * a quote makes the point better than a paraphrase of it.
 */
function pickPoints(facets: GroupableFacet[]): JesusTopicPoint[] {
  const seen = new Set<string>();
  const unique: GroupableFacet[] = [];

  for (const facet of facets) {
    const key = facet.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(facet);
  }

  return unique
    .sort((a, b) => Number(!a.text) - Number(!b.text))
    .slice(0, TOPIC_POINT_LIMIT)
    .map((facet) => ({
      slug: facet.slug,
      title: facet.title,
      text: facet.text,
      summary: facet.summary,
      reference: facet.reference,
      provenance: facet.provenance,
    }));
}

/** Distinct Gospels, canonical order first, anything else after in first-seen order. */
function orderGospels(names: string[]): string[] {
  const distinct = [...new Set(names)];
  // `sort` mutates, so first-seen order is captured before sorting rather than
  // read back out of the array being sorted.
  const seenAt = new Map(distinct.map((name, index) => [name, index]));
  return distinct.sort((a, b) => {
    const ai = GOSPEL_ORDER.indexOf(a);
    const bi = GOSPEL_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) {
      return (seenAt.get(a) ?? 0) - (seenAt.get(b) ?? 0);
    }
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
