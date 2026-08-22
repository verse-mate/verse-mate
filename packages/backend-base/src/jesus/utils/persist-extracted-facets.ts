import { JESUS_FACET_META } from "../jesus.constants";
/**
 * Decide which extracted facets are worth storing, and store them at level 1.
 *
 * Shared by the synchronous `jesus:extract` and the batched collect so both
 * apply identical rules — otherwise "we batched it" would mean "we kept a
 * different set".
 */
import type { ExtractedFacet } from "./generation-validation";

/** Facet types that currently have no content at all, per the status doc. */
export const EMPTY_CATEGORIES = [
  "PROMISE",
  "WARNING",
  "PRAYER",
  "PROPHECY",
  "SYMBOLIC_ACTION",
] as const;

export interface KeepTally {
  proposed: number;
  written: number;
  noText: number;
  duplicate: number;
  filtered: number;
}

export const normalizeFacetKey = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

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
 */
export function selectFacetsToWrite(input: {
  facets: ExtractedFacet[];
  existingKeys: Set<string>;
  wantedTypes: ReadonlySet<string> | null;
  eventSlug: string;
  usedSlugs: Set<string>;
  tally: KeepTally;
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

  for (const f of input.facets) {
    input.tally.proposed++;
    if (input.wantedTypes && !input.wantedTypes.has(f.type)) {
      input.tally.filtered++;
      continue;
    }

    const meta = JESUS_FACET_META[f.type as keyof typeof JESUS_FACET_META];
    const mode = (meta?.mode ?? f.mode) as "WORD" | "ACTION";
    const text = (f.text ?? "").trim();

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
    input.tally.written++;
  }

  return out;
}
