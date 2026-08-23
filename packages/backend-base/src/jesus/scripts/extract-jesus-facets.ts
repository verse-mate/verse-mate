/**
 * Run the level-1 facet extraction and persist what passes.
 *
 *   bun run jesus:extract -- --limit=5                 # dry run, no --apply
 *   bun run jesus:extract -- --apply                   # fill what is under target
 *   bun run jesus:extract -- --types=QUESTION,CLAIM --apply
 *   bun run jesus:extract -- --types=empty --apply     # the original run
 *   bun run jesus:extract -- --all-types --cap=5 --apply
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
 * change what the product is.
 *
 * The first default was the surgical case — only the five types that had no
 * content at all. That turned out to be the wrong knob. It filled Warning,
 * Prayer and Prophecy well past what any published catalogue lists while
 * Question, Command, Teaching, Claim and Encounter, which extraction had
 * already found content for, stayed at their curated counts and read as thin.
 * One flag produced both complaints.
 *
 * So the default is now **whatever is under target**: the script counts what
 * each type currently carries, compares against `JESUS_CATEGORY_TARGETS`, and
 * fills the ones below their range. Two things bound it:
 *
 *  - a per-event-per-type cap (`--cap=`), so a category cannot come to mean
 *    "the Olivet discourse, forty times"
 *  - a type drops out of the run once it reaches the middle of its band
 *
 * The bands are approximate, so neither bound is a number to hit exactly. The
 * run aims at the middle rather than the floor and stops there; landing a few
 * either side of it is the expected outcome, not a miss.
 *
 * `--types=A,B` narrows it, `--types=empty` restores the original surgical
 * case, and `--all-types` still takes everything the cap allows.
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
import {
  JESUS_CATEGORY_TARGETS,
  JESUS_FACET_TYPES,
  type JesusFacetType,
  assessCoverage,
  fillGoal,
  typesUnderTarget,
} from "../jesus.constants";
import { JesusEventRepository } from "../repository/jesus-event.repository";
import { JesusGenerationService } from "../services/jesus-generation.service";
import {
  DEFAULT_PER_EVENT_TYPE_CAP,
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
  const cap =
    Number.parseInt(get("cap") ?? "0", 10) || DEFAULT_PER_EVENT_TYPE_CAP;
  const slugsArg = get("slugs")
    ?.split(",")
    .map((s) => s.trim());

  const conn = db.getOrCreateConnection();
  const events = new JesusEventRepository(db);
  const service = new JesusGenerationService(db);

  // What each type carries right now. This is the input to both the default
  // ("fill what is under target") and the stop condition ("and stop there").
  const countRows = await conn
    .selectFrom("jesus_facets")
    .where("is_active", "=", true)
    .select((eb) => ["type", eb.fn.countAll<string>().as("count")])
    .groupBy("type")
    .execute();
  const liveCounts: Partial<Record<JesusFacetType, number>> = {};
  for (const r of countRows) {
    if ((JESUS_FACET_TYPES as readonly string[]).includes(r.type)) {
      liveCounts[r.type as JesusFacetType] = Number(r.count);
    }
  }

  const typesArg = get("types")
    ?.split(",")
    .map((t) => t.trim().toUpperCase());

  const wanted = new Set(
    allTypes
      ? []
      : typesArg?.includes("EMPTY")
        ? EMPTY_CATEGORIES
        : typesArg ?? typesUnderTarget(liveCounts),
  );

  if (!allTypes && wanted.size === 0) {
    console.log(
      "No category is clearly short of its band — nothing to fill.\n" +
        "The bands are approximate, so this means 'about right', not 'exact'.\n" +
        "Pass --types= or --all-types to run anyway.",
    );
    await db.closeConnection();
    return;
  }

  // Remaining headroom per type, so a run lands in the band instead of running
  // to whatever the model happens to propose. Aimed at the middle of the band,
  // not its floor — the bands are approximate and their edges carry no more
  // authority than their middles.
  const headroom = new Map<string, number>();
  for (const row of assessCoverage(liveCounts)) {
    if (!allTypes && !wanted.has(row.type)) continue;
    headroom.set(
      row.type,
      row.target
        ? Math.max(0, fillGoal(row.target) - row.count)
        : Number.POSITIVE_INFINITY,
    );
  }

  const all = await events.listEvents(
    {},
    { limit: 1000, orderBy: "chronology" },
  );
  const targets = all
    .filter((e) => !slugsArg || slugsArg.includes(e.slug))
    .slice(0, limit);

  console.log(
    `${apply ? "" : "[no --apply, nothing will be written] "}${targets.length} event(s) · cap ${cap}/event/type · keeping ${allTypes ? "ALL types" : [...wanted].join(", ")}\n`,
  );
  if (!allTypes) {
    for (const type of wanted) {
      const need = headroom.get(type);
      const target = JESUS_CATEGORY_TARGETS[type as JesusFacetType];
      if (target && Number.isFinite(need)) {
        console.log(
          `  ${type.padEnd(16)} ${liveCounts[type as JesusFacetType] ?? 0} → ~${fillGoal(target)} (band ${target.min}-${target.max}, roughly ${need} to go)`,
        );
      }
    }
    console.log("");
  }

  const tally: KeepTally & { rejected: number } = {
    proposed: 0,
    written: 0,
    noText: 0,
    duplicate: 0,
    filtered: 0,
    capped: 0,
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
    const existingTypeCounts: Record<string, number> = {};
    for (const f of full.facets ?? []) {
      existingTypeCounts[f.type] = (existingTypeCounts[f.type] ?? 0) + 1;
    }

    // A type that has reached the middle of its band mid-run drops out for the
    // remaining events, so the run lands in the range rather than overshooting
    // it the way the first one did.
    const stillWanted = allTypes
      ? null
      : new Set(
          [...wanted].filter((t) => (headroom.get(t) ?? Number.NaN) !== 0),
        );
    if (stillWanted && stillWanted.size === 0) break;

    const keep = selectFacetsToWrite({
      facets: result.accepted,
      existingKeys,
      wantedTypes: stillWanted,
      eventSlug: e.slug,
      usedSlugs: seenSlugs,
      tally,
      existingTypeCounts,
      perEventTypeCap: cap,
    });

    for (const f of keep) {
      const left = headroom.get(f.type);
      if (left !== undefined && Number.isFinite(left)) {
        headroom.set(f.type, Math.max(0, left - 1));
      }
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
    `\nproposed ${tally.proposed} · kept ${tally.written} · dropped: ${tally.filtered} wrong type, ${tally.noText} no text, ${tally.duplicate} duplicate, ${tally.capped} over the per-event cap · model-rejected ${tally.rejected}`,
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
