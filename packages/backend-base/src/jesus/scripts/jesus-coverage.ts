import { db } from "database";
/**
 * Report what each Jesus category carries against what it should.
 *
 *   bun run jesus:coverage           # against the database
 *   bun run jesus:coverage -- --seed # against the seed corpus, no database
 *
 * "The encounters are under-represented" was true and nobody could act on it,
 * because the repo held no number to be under. `JESUS_CATEGORY_TARGETS` holds
 * approximate bands now and this prints the comparison — so the claim is
 * settled by running something rather than by argument, and `jesus:extract`
 * fills toward the same numbers.
 *
 * The bands are approximate on purpose and a count only shows as out once it
 * is clearly out, so read this as orientation rather than as a scorecard.
 * Nothing here fails a build.
 *
 * Two counts differ and both are worth seeing:
 *
 *  - **facets** — what a browse category actually shows, curated (level 2) plus
 *    extracted (level 1). This is what the targets are set against.
 *  - **seed entries** — the hand-authored corpus alone. Always the smaller
 *    number, and the one `--seed` reports when there is no database to hand.
 */
import { JESUS_ENTRIES } from "database/src/seeds/data/jesus.data";
import {
  JESUS_FACET_TYPES,
  type JesusFacetType,
  MIRACLE_CATALOGUE_TARGET,
  MIRACLE_CATALOGUE_TYPES,
  assessCoverage,
} from "../jesus.constants";

const MARK = { under: "▽", ok: "·", over: "△", untargeted: " " } as const;

function render(
  counts: Partial<Record<JesusFacetType, number>>,
  heading: string,
) {
  console.log(`\n${heading}\n`);
  console.log(
    `  ${"".padEnd(2)}${"category".padEnd(18)}${"count".padStart(6)}  ${"roughly".padEnd(10)}  note`,
  );

  let under = 0;
  let over = 0;

  for (const row of assessCoverage(counts)) {
    const range = row.target ? `${row.target.min}-${row.target.max}` : "—";
    const note = !row.target
      ? "no published range to anchor on"
      : row.status === "under"
        ? `~${row.delta} short`
        : row.status === "over"
          ? `~${row.delta} over`
          : row.target.unit ?? "about right";

    if (row.status === "under") under++;
    if (row.status === "over") over++;

    console.log(
      `  ${MARK[row.status]} ${row.label.padEnd(18)}${String(row.count).padStart(6)}  ${range.padEnd(10)}  ${note}`,
    );
  }

  // Miracle and Healing split one traditional catalogue between them, so the
  // pair is the number that answers "are the miracles all there".
  const catalogue = MIRACLE_CATALOGUE_TYPES.reduce(
    (sum, t) => sum + (counts[t] ?? 0),
    0,
  );
  const catalogueOk =
    catalogue >= MIRACLE_CATALOGUE_TARGET.min &&
    catalogue <= MIRACLE_CATALOGUE_TARGET.max;
  console.log(
    `\n  ${catalogueOk ? "·" : catalogue < MIRACLE_CATALOGUE_TARGET.min ? "▽" : "△"} ${"Miracle + Healing".padEnd(18)}${String(catalogue).padStart(6)}  ${`${MIRACLE_CATALOGUE_TARGET.min}-${MIRACLE_CATALOGUE_TARGET.max}`.padEnd(10)}  traditional catalogue, ~37`,
  );

  console.log(
    `\n  ${under} clearly short · ${over} clearly over · the rest about right\n  Bands are approximate — a count near its band is fine.`,
  );
}

async function main() {
  const seedOnly = process.argv.slice(2).includes("--seed");

  // The seed corpus, which needs no database. `kind` on an entry becomes
  // `type` on its projected facet, so the two are directly comparable.
  const seedCounts: Partial<Record<JesusFacetType, number>> = {};
  for (const entry of JESUS_ENTRIES) {
    if ((JESUS_FACET_TYPES as readonly string[]).includes(entry.kind)) {
      const t = entry.kind as JesusFacetType;
      seedCounts[t] = (seedCounts[t] ?? 0) + 1;
    }
  }

  render(seedCounts, "Seed corpus — hand-authored entries (level 2 only)");

  if (seedOnly) return;

  const conn = db.getOrCreateConnection();
  try {
    const rows = await conn
      .selectFrom("jesus_facets")
      .where("is_active", "=", true)
      .select((eb) => [
        "type",
        "provenance",
        eb.fn.countAll<string>().as("count"),
      ])
      .groupBy(["type", "provenance"])
      .execute();

    const live: Partial<Record<JesusFacetType, number>> = {};
    let extracted = 0;
    for (const r of rows) {
      const n = Number(r.count);
      if ((JESUS_FACET_TYPES as readonly string[]).includes(r.type)) {
        const t = r.type as JesusFacetType;
        live[t] = (live[t] ?? 0) + n;
      }
      if (Number(r.provenance) === 1) extracted += n;
    }

    render(
      live,
      `Live facets — what the browse categories show (${extracted} extracted at level 1)`,
    );

    console.log(
      "\n  ▽ fill with:  bun run jesus:extract -- --apply" +
        "\n  △ level-1 rows are identifiable by provenance = 1, so an over-filled" +
        "\n    category can be trimmed without touching curated content.",
    );
  } finally {
    await db.closeConnection();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
