/**
 * Run the level-1 facet extraction and persist what passes.
 *
 *   bun run jesus:extract -- --dry-run --limit=5
 *   bun run jesus:extract -- --types=PRAYER,PROMISE,WARNING,PROPHECY,SYMBOLIC_ACTION --apply
 *   bun run jesus:extract -- --apply            # everything the model finds
 *
 * `JesusGenerationService.extractFacets` validated but never persisted —
 * nothing in the repo called it, so no level-1 row has ever existed. This is
 * the missing half: it writes the accepted facets at provenance 1.
 *
 * WHY IT FILTERS BY DEFAULT
 *
 * Extraction is far more granular than the curated corpus: Gethsemane alone
 * yields ~49 facets against a corpus that averages one per event. Writing
 * everything would put five figures of level-1 rows behind 231 curated ones and
 * change what the product is — a decision for a person, not for this script.
 *
 * So the default is the surgical case: only the facet types that currently have
 * NO content at all (Promise, Warning, Prayer, Prophecy, Symbolic action), which
 * are the categories the hub renders empty. Pass `--types=` to widen it, or
 * `--all-types` to take everything.
 *
 * TWO RULES ON WHAT IS KEPT
 *
 *  1. A WORD facet must carry text. A saying facet with no words is the exact
 *     defect this corpus already had 68 of; extraction routinely proposes
 *     `[PRAYER] Falls on His face` with an empty quote, which is an action
 *     described as speech.
 *  2. It must not duplicate a facet the event already has, compared on
 *     normalised text. The Gospels' parallel accounts of one saying arrive as
 *     separate facets and the event model exists to collapse them.
 *
 * Level-1 rows are identifiable by `provenance = 1`, so a run is reversible.
 */
import { db } from "database";
import { JesusEventRepository } from "../repository/jesus-event.repository";
import { JesusGenerationService } from "../services/jesus-generation.service";
import {
  EMPTY_CATEGORIES,
  type KeepTally,
  normalizeFacetKey,
  selectFacetsToWrite,
} from "../utils/persist-extracted-facets";

async function main() {
  const argv = process.argv.slice(2);
  const get = (n: string) =>
    argv
      .find((a) => a.startsWith(`--${n}=`))
      ?.split("=")
      .slice(1)
      .join("=");
  const has = (n: string) => argv.includes(`--${n}`);

  const apply = has("apply");
  const allTypes = has("all-types");
  const limit =
    Number.parseInt(get("limit") ?? "0", 10) || Number.POSITIVE_INFINITY;
  const slugsArg = get("slugs")
    ?.split(",")
    .map((s) => s.trim());
  const wanted = new Set(
    allTypes
      ? []
      : get("types")
          ?.split(",")
          .map((t) => t.trim().toUpperCase()) ?? EMPTY_CATEGORIES,
  );

  const conn = db.getOrCreateConnection();
  const events = new JesusEventRepository(db);
  const service = new JesusGenerationService(db);

  const all = await events.listEvents(
    {},
    { limit: 1000, orderBy: "chronology" },
  );
  const targets = all
    .filter((e) => !slugsArg || slugsArg.includes(e.slug))
    .slice(0, limit);

  console.log(
    `${apply ? "" : "[no --apply, nothing will be written] "}${targets.length} event(s) · keeping ${allTypes ? "ALL types" : [...wanted].join(", ")}\n`,
  );

  const tally: KeepTally & { rejected: number } = {
    proposed: 0,
    written: 0,
    noText: 0,
    duplicate: 0,
    filtered: 0,
    rejected: 0,
  };
  const seenSlugs = new Set<string>();

  for (const e of targets) {
    const result = await service.extractFacets(e.slug, {});
    if (result.status !== "ok") {
      console.log(`  ✗ ${e.slug} — ${result.status}: ${result.detail ?? ""}`);
      continue;
    }
    tally.rejected += result.rejected.length;

    const full = await events.getEventBySlug(e.slug, "en-US");
    if (!full) continue;
    const existingKeys = new Set(
      (full.facets ?? []).map((f) =>
        normalizeFacetKey(String(f.text ?? f.title ?? "")),
      ),
    );

    const keep = selectFacetsToWrite({
      facets: result.accepted,
      existingKeys,
      wantedTypes: allTypes ? null : wanted,
      eventSlug: e.slug,
      usedSlugs: seenSlugs,
      tally,
    });

    for (const f of keep) {
      if (!apply) continue;
      await conn
        .insertInto("jesus_facets")
        .values({
          event_id: full.event_id,
          slug: f.slug,
          mode: f.mode,
          type: f.type,
          speaker: f.mode === "WORD" ? "JESUS" : null,
          actor: f.mode === "ACTION" ? "JESUS" : null,
          title: f.title,
          text: f.text,
          summary: null,
          provenance: 1,
          sort_order: 100,
          is_active: true,
        })
        .onConflict((oc) => oc.column("slug").doNothing())
        .execute();
    }
    const wroteForEvent = keep.length;
    if (wroteForEvent)
      console.log(
        `  ✓ ${e.slug.padEnd(44)} +${wroteForEvent} level-1 facet(s)`,
      );
  }

  console.log(
    `\nproposed ${tally.proposed} · kept ${tally.written} · dropped: ${tally.filtered} wrong type, ${tally.noText} no text, ${tally.duplicate} duplicate · model-rejected ${tally.rejected}`,
  );
  console.log(
    apply ? "written at provenance 1" : "nothing written (no --apply)",
  );
  await db.closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
