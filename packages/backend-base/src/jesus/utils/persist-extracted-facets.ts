import { JESUS_FACET_META } from "../jesus.constants";
/**
 * Decide which extracted facets are worth storing, and store them at level 1.
 *
 * Shared by the synchronous `jesus:extract` and the batched collect so both
 * apply identical rules — otherwise "we batched it" would mean "we kept a
 * different set".
 */
import type { ExtractedFacet } from "./generation-validation";

/**
 * The five categories that had no content at all when extraction was first
 * run, and were its default target.
 *
 * Keeping this as the default is what produced both halves of the complaint
 * that followed: Warning, Prayer and Prophecy took all 466 written facets
 * between them and read as padded, while Question, Command, Teaching, Claim
 * and Encounter — which extraction had already found content for — got none
 * and stayed thin. `jesus:extract` now defaults to whatever is under target
 * instead. This stays for `--types=empty`, which is still the right run when
 * a genuinely new category ships.
 */
export const EMPTY_CATEGORIES = [
  "PROMISE",
  "WARNING",
  "PRAYER",
  "PROPHECY",
  "SYMBOLIC_ACTION",
] as const;

/**
 * Most facets of one type a single event may contribute in one run.
 *
 * Extraction is far more granular than the corpus — Gethsemane alone proposes
 * ~49 facets — so without a cap a category's count is really a count of how
 * many verses its biggest event has. Warning ended up meaning "the Olivet
 * discourse, forty times". A cap spreads a category across the events that
 * actually differ, which is what makes a browse category worth opening.
 */
export const DEFAULT_PER_EVENT_TYPE_CAP = 3;

export interface KeepTally {
  proposed: number;
  written: number;
  noText: number;
  duplicate: number;
  filtered: number;
  /** Dropped because this event had already given this type its cap. */
  capped: number;
}

export const normalizeFacetKey = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Drop quotation marks that wrap the whole value.
 *
 * Extraction returns a saying either bare or wrapped — 85 of 391 rows came back
 * as `"Watch out!"` while the curated corpus stores none that way. The UI puts
 * facet text in its own quoted presentation, so the wrapped ones rendered with
 * visible double quotes and the rest did not. Marks *inside* the saying are
 * content and are left alone.
 */
export const stripWrappingQuotes = (s: string) => {
  const t = s.trim();
  const wrapped = /^([“"'‘])([\s\S]*)([”"'’])$/.exec(t);
  if (!wrapped) return t;
  const inner = wrapped[2].trim();
  // Only unwrap when the marks really are a pair around the whole value.
  return inner && !/^[“"'‘]/.test(inner) ? inner : t;
};

export const facetSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/**
 * Filter one event's extraction down to what should be written.
 *
 *  - wrong type: not among the categories being filled
 *  - no text: a WORD facet without words, which is an action described as
 *    speech — the exact defect this corpus already had 68 of
 *  - duplicate: the event already carries that saying, usually because the
 *    Gospels' parallel accounts arrive as separate facets
 *  - capped: this event has already given this type `perEventTypeCap` facets,
 *    so the rest of the category's budget goes to other events
 *
 * The cap counts what this event already carries as well as what this run has
 * added, so a re-run does not stack a second cap's worth on top of the first.
 */
export function selectFacetsToWrite(input: {
  facets: ExtractedFacet[];
  existingKeys: Set<string>;
  wantedTypes: ReadonlySet<string> | null;
  eventSlug: string;
  usedSlugs: Set<string>;
  tally: KeepTally;
  /** How many facets of one type this event already carries, by type. */
  existingTypeCounts?: Partial<Record<string, number>>;
  /** Defaults to `DEFAULT_PER_EVENT_TYPE_CAP`; `Infinity` disables the cap. */
  perEventTypeCap?: number;
}): Array<{
  slug: string;
  mode: "WORD" | "ACTION";
  type: string;
  title: string;
  text: string | null;
}> {
  const out: Array<{
    slug: string;
    mode: "WORD" | "ACTION";
    type: string;
    title: string;
    text: string | null;
  }> = [];

  const cap = input.perEventTypeCap ?? DEFAULT_PER_EVENT_TYPE_CAP;
  // Seeded with what the event already has, so the cap is a ceiling on the
  // event's total for that type rather than on each run.
  const perType = new Map<string, number>(
    Object.entries(input.existingTypeCounts ?? {}).map(([t, n]) => [t, n ?? 0]),
  );

  for (const f of input.facets) {
    input.tally.proposed++;
    if (input.wantedTypes && !input.wantedTypes.has(f.type)) {
      input.tally.filtered++;
      continue;
    }

    if ((perType.get(f.type) ?? 0) >= cap) {
      input.tally.capped++;
      continue;
    }

    const meta = JESUS_FACET_META[f.type as keyof typeof JESUS_FACET_META];
    const mode = (meta?.mode ?? f.mode) as "WORD" | "ACTION";
    const text = stripWrappingQuotes(f.text ?? "");

    if (mode === "WORD" && !text) {
      input.tally.noText++;
      continue;
    }

    const key = normalizeFacetKey(text || f.title);
    if (input.existingKeys.has(key)) {
      input.tally.duplicate++;
      continue;
    }
    input.existingKeys.add(key);

    let slug = `${input.eventSlug}-${facetSlug(f.title)}`;
    let n = 2;
    while (input.usedSlugs.has(slug))
      slug = `${input.eventSlug}-${facetSlug(f.title)}-${n++}`;
    input.usedSlugs.add(slug);

    out.push({ slug, mode, type: f.type, title: f.title, text: text || null });
    perType.set(f.type, (perType.get(f.type) ?? 0) + 1);
    input.tally.written++;
  }

  return out;
}
