import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

// ─────────────────────────────────────────────────────────────────────────────
// Repairs 59 NASB1995 section headings that render as "The Day of theLordand
// the Future" instead of "The Day of the Lord and the Future".
//
// Cause: the upstream scrape that produced
// `packages/backend-base/src/bible/data/NASB1995.json` rendered the divine name
// as a small-caps element, and the text extraction dropped the whitespace on
// both sides of it. So "the <span>Lord</span> and" collapsed to "theLordand".
// Only the `subtitles` (section heading) rows are affected — all 31,103 verses
// in that file are clean.
//
// The data file is fixed in the same change, but the seeder inserts subtitles
// with ON CONFLICT DO NOTHING, so an already-seeded database keeps the broken
// text forever. Hence this backfill.
//
// The repairs are an explicit frozen list rather than a regex. A regex general
// enough to fix these (`Lord([A-Za-z])` -> `Lord \1`) also corrupts legitimate
// words — "The Lord of Lords" becomes "The Lord of Lord s", and "Lordship"
// becomes "Lord ship". Matching whole known strings cannot misfire on rows this
// change never inspected, including subtitles from other translations ingested
// via `ingest-versions`. The list is pinned to what shipped: an applied
// migration is a historical fact and must not change retroactively if the
// source data is edited again later.
// ─────────────────────────────────────────────────────────────────────────────

/** [broken, repaired] — every distinct affected subtitle. */
const SUBTITLE_REPAIRS: readonly (readonly [string, string])[] = [
  ["Parable of the Sword of theLord", "Parable of the Sword of the Lord"],
  ["TheLord’sPortion of the Land", "The Lord’s Portion of the Land"],
  ["Samuel before theLordas a Boy", "Samuel before the Lord as a Boy"],
  ["TheLordPardons and Rebukes", "The Lord Pardons and Rebukes"],
  ["Judgment on the Day of theLord", "Judgment on the Day of the Lord"],
  ["The Day of theLordand the Future", "The Day of the Lord and the Future"],
  ["TheLordProvides Water", "The Lord Provides Water"],
  ["TheLordProvides Manna", "The Lord Provides Manna"],
  ["TheLordProvides Meat", "The Lord Provides Meat"],
  ["TheLordVisits Sinai", "The Lord Visits Sinai"],
  ["The Glory of theLord", "The Glory of the Lord"],
  ["“We Will Serve theLord”", "“We Will Serve the Lord”"],
  ["The Reign of theLord’sAnointed.", "The Reign of the Lord’s Anointed."],
  [
    "TheLordImplored to Defend the Psalmist against the Wicked.",
    "The Lord Implored to Defend the Psalmist against the Wicked.",
  ],
  ["TheLord’sGlory and Man’s Dignity.", "The Lord’s Glory and Man’s Dignity."],
  ["TheLorda Refuge and Defense.", "The Lord a Refuge and Defense."],
  [
    "TheLordthe Psalmist’s Portion in Life and Deliverer in Death.",
    "The Lord the Psalmist’s Portion in Life and Deliverer in Death.",
  ],
  [
    "TheLordPraised for Giving Deliverance.",
    "The Lord Praised for Giving Deliverance.",
  ],
  ["TheLord, the Psalmist’s Shepherd.", "The Lord, the Psalmist’s Shepherd."],
  ["The Voice of theLordin the Storm.", "The Voice of the Lord in the Storm."],
  ["TheLord, a Provider and Deliverer.", "The Lord, a Provider and Deliverer."],
  [
    "Security of Those Who Trust in theLord, and Insecurity of the Wicked.",
    "Security of Those Who Trust in the Lord, and Insecurity of the Wicked.",
  ],
  [
    "TheLord’sCovenant with David, and Israel’s Afflictions.",
    "The Lord’s Covenant with David, and Israel’s Afflictions.",
  ],
  [
    "Security of the One Who Trusts in theLord.",
    "Security of the One Who Trusts in the Lord.",
  ],
  ["Praise for theLord’sGoodness.", "Praise for the Lord’s Goodness."],
  ["The Majesty of theLord.", "The Majesty of the Lord."],
  [
    "TheLordImplored to Avenge His People.",
    "The Lord Implored to Avenge His People.",
  ],
  [
    "Praise to theLord, and Warning against Unbelief.",
    "Praise to the Lord, and Warning against Unbelief.",
  ],
  [
    "A Call to Worship theLordthe Righteous Judge.",
    "A Call to Worship the Lord the Righteous Judge.",
  ],
  ["TheLord’sPower and Dominion.", "The Lord’s Power and Dominion."],
  [
    "A Call to Praise theLordfor His Righteousness.",
    "A Call to Praise the Lord for His Righteousness.",
  ],
  [
    "Praise to theLordfor His Fidelity to Israel.",
    "Praise to the Lord for His Fidelity to Israel.",
  ],
  ["Praise for theLord’sMercies.", "Praise for the Lord’s Mercies."],
  ["TheLord’sCare over All His Works.", "The Lord’s Care over All His Works."],
  [
    "TheLord’sWonderful Works in Behalf of Israel.",
    "The Lord’s Wonderful Works in Behalf of Israel.",
  ],
  [
    "Israel’s Rebelliousness and theLord’sDeliverances.",
    "Israel’s Rebelliousness and the Lord’s Deliverances.",
  ],
  [
    "TheLordDelivers Men from Manifold Troubles.",
    "The Lord Delivers Men from Manifold Troubles.",
  ],
  [
    "TheLordGives Dominion to the King.",
    "The Lord Gives Dominion to the King.",
  ],
  ["TheLordPraised for His Goodness.", "The Lord Praised for His Goodness."],
  [
    "Prosperity of the One Who Fears theLord.",
    "Prosperity of the One Who Fears the Lord.",
  ],
  ["TheLordExalts the Humble.", "The Lord Exalts the Humble."],
  [
    "Heathen Idols Contrasted with theLord.",
    "Heathen Idols Contrasted with the Lord.",
  ],
  [
    "Thanksgiving for theLord’sSaving Goodness.",
    "Thanksgiving for the Lord’s Saving Goodness.",
  ],
  ["TheLordthe Keeper of Israel.", "The Lord the Keeper of Israel."],
  ["Prayer for theLord’sHelp.", "Prayer for the Lord’s Help."],
  ["TheLordSurrounds His People.", "The Lord Surrounds His People."],
  ["Prosperity Comes from theLord.", "Prosperity Comes from the Lord."],
  [
    "Blessedness of the Fear of theLord.",
    "Blessedness of the Fear of the Lord.",
  ],
  ["Hope in theLord’sForgiving Love.", "Hope in the Lord’s Forgiving Love."],
  ["Childlike Trust in theLord.", "Childlike Trust in the Lord."],
  [
    "Prayer for theLord’sBlessing upon the Sanctuary.",
    "Prayer for the Lord’s Blessing upon the Sanctuary.",
  ],
  [
    "Praise theLord’sWonderful Works. Vanity of Idols.",
    "Praise the Lord’s Wonderful Works. Vanity of Idols.",
  ],
  [
    "Thanks for theLord’sGoodness to Israel.",
    "Thanks for the Lord’s Goodness to Israel.",
  ],
  ["Thanksgiving for theLord’sFavor.", "Thanksgiving for the Lord’s Favor."],
  ["TheLordExtolled for His Goodness.", "The Lord Extolled for His Goodness."],
  ["TheLordan Abundant Helper.", "The Lord an Abundant Helper."],
  [
    "The Whole Creation Invoked to Praise theLord.",
    "The Whole Creation Invoked to Praise the Lord.",
  ],
  ["Israel Invoked to Praise theLord.", "Israel Invoked to Praise the Lord."],
  ["The Day of theLord", "The Day of the Lord"],
];

export async function up(db: Kysely<Database>): Promise<void> {
  // One set-based UPDATE joined against a VALUES list, rather than 59 round
  // trips. Rows already carrying the repaired text simply do not match.
  // The ::text casts are required, not decorative: parameters in a bare VALUES
  // list have no context Postgres can infer a type from, and it fails the
  // statement with "could not determine data type of parameter".
  const pairs = sql.join(
    SUBTITLE_REPAIRS.map(
      ([broken, repaired]) => sql`(${broken}::text, ${repaired}::text)`,
    ),
    sql`, `,
  );

  const result = await sql`
    UPDATE subtitles AS s
    SET subtitle = r.repaired
    FROM (VALUES ${pairs}) AS r(broken, repaired)
    WHERE s.subtitle = r.broken
  `.execute(db);

  console.log(
    `Repaired ${result.numAffectedRows ?? 0} subtitle(s) with a missing space around the divine name.`,
  );
}

export async function down(): Promise<void> {
  // Intentionally a no-op: rolling back would mean writing the typo back in.
}
