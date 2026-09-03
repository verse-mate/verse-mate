/**
 * The coaching rubric, the ONE authoritative definition of the cluster names
 * and weights, the dimension-to-cluster mapping, each dimension's plain-English
 * description and research-backed target, and the band labels.
 *
 * Every surface that displays or computes a score derives from this file. Before
 * it existed the same values were hand-maintained in `dimensionInfo.ts`,
 * `CoachAdminScreen.tsx`, `CoachTrendCharts.tsx`, `dashboardTheme.ts` and
 * `coachService.statusColor` in the portal, and again in the retired host's
 * generator, so changing a weight meant finding every copy, and a missed one
 * showed a leader a breakdown that did not add up to their own score.
 * A second hand-maintained copy of these values is a defect (spec: "Rubric
 * Definition Is Single-Source").
 */

export const RUBRIC_MODEL_VERSION = "v3-weighted-100";

export interface RubricCluster {
  name: string;
  /** Points this cluster contributes at 100%. The four sum to 100. */
  weight: number;
}

export interface RubricDimension {
  n: number;
  name: string;
  cluster: string;
  /** What the dimension measures, in plain English. */
  what: string;
  /** The research-backed target it is scored against. */
  target: string;
}

export interface StatusBand {
  /** Lowest composite score in the band. */
  min: number;
  label: string;
  emoji: string;
}

export const CLUSTERS: readonly RubricCluster[] = [
  { name: "Teaching Craft", weight: 33 },
  { name: "Building Ministry", weight: 31 },
  { name: "Engaging People", weight: 18 },
  { name: "Being Real", weight: 18 },
];

export const DIMENSIONS: readonly RubricDimension[] = [
  {
    n: 1,
    name: "Session Structure & Flow",
    cluster: "Teaching Craft",
    what: "How well the session follows the 10-step blueprint, fellowship, opening prayer, newcomer welcome, Big Ideas review, context, scripture reading, teaching, application, and closing prayer.",
    target: "All 10 steps, well-paced",
  },
  {
    n: 2,
    name: "Newcomer Welcome",
    cluster: "Building Ministry",
    what: "Time spent welcoming newcomers, with existing members sharing testimonies first. Not applicable when no newcomers are present (never a penalty).",
    target: "7–25 min with member testimonies",
  },
  {
    n: 3,
    name: "Scripture Engagement",
    cluster: "Teaching Craft",
    what: "Depth of engagement with the text, how many cross-references are used and how much of the discussion stays grounded in scripture.",
    target: "6+ cross-references (Lifeway / REVEAL)",
  },
  {
    n: 4,
    name: "Facilitation vs. Lecture",
    cluster: "Engaging People",
    what: "The balance of discussion vs. lecture, how much the room does the thinking versus the leader talking (measured discussion-only, excluding scripture reading and the newcomer welcome).",
    target: "Leader talk ≤ 30–35% (Lifeway 30% Rule)",
  },
  {
    n: 5,
    name: "Application Questions",
    cluster: "Teaching Craft",
    what: "Questions that move the group from concept to life, weighted by cognitive demand (Depth of Knowledge) and whether they draw out first-person, personal responses.",
    target: "5–7 Big Ideas, majority DOK 3–4 (Webb)",
  },
  {
    n: 6,
    name: "Participant Engagement",
    cluster: "Engaging People",
    what: "The share of the room contributing substantively (interpreting/applying, not just reading aloud), called on by name.",
    target: "70–80% participate (Rowe)",
  },
  {
    n: 7,
    name: "Visual Aids",
    cluster: "Teaching Craft",
    what: "Charts, slides, maps, or on-screen word-study tools (Blue Letter Bible, VerseMate, Logos, etc.) that reinforce the teaching multi-modally.",
    target: "≥1 visual / word-study aid (Mayer)",
  },
  {
    n: 8,
    name: "Vulnerability / Authenticity",
    cluster: "Being Real",
    what: "Personal honesty with real cost, weighted by depth rather than count, the modeling that builds a room safe enough for members to open up. Scored against the leader’s rolling baseline.",
    target: "Costly, sustained authenticity",
  },
  {
    n: 9,
    name: "Memory Reinforcement",
    cluster: "Teaching Craft",
    what: "Cumulative review of prior Big Ideas at the start of the session, so earlier lessons stick.",
    target: "Opening recall drill (Ebbinghaus)",
  },
  {
    n: 10,
    name: "Homework References",
    cluster: "Building Ministry",
    what: "Use of homework, Precept workbooks and “The Guarantee”, referenced and rewarded so prepared members are differentiated.",
    target: "Referenced and rewarded",
  },
  {
    n: 11,
    name: "Prayer",
    cluster: "Being Real",
    what: "Prayer woven through the session, delegated opening and closing prayer, prayer requests, and prayer-chain infrastructure.",
    target: "Delegated open + close",
  },
  {
    n: 12,
    name: "Leader Development",
    cluster: "Building Ministry",
    what: "Observable, in-session development of another leader, a named apprentice, a delegated facilitation window, or public coaching (2 Timothy 2:2).",
    target: "Visible apprentice hand-off",
  },
];

/** Composite bands, highest first, the first whose `min` is met wins. */
export const STATUS_BANDS: readonly StatusBand[] = [
  { min: 85, label: "Exceptional", emoji: "\u{1F537}" },
  { min: 72, label: "Strong", emoji: "\u{1F7E2}" },
  { min: 60, label: "On Target", emoji: "\u{1F7E1}" },
  { min: 45, label: "Developing", emoji: "\u{1F7E0}" },
  { min: 0, label: "Early Stage", emoji: "\u{1F534}" },
];

/** Plain-English read of a single 1-5 dimension score. */
export function dimensionBandLabel(score: number | null): string {
  if (score == null) return "Not applicable this session";
  if (score >= 5) return "Exemplary";
  if (score >= 4) return "Strong";
  if (score >= 3) return "On target";
  if (score >= 2) return "Developing";
  return "Early stage";
}

/** The band a composite score falls in. */
export function statusForScore(score: number): StatusBand {
  return (
    STATUS_BANDS.find((b) => score >= b.min) ??
    STATUS_BANDS[STATUS_BANDS.length - 1]
  );
}

/**
 * Each cluster's percentage: the sum of its scored dimensions over five times
 * how many were scored. A not-applicable dimension (null) is excluded from the
 * DENOMINATOR rather than counted as zero, so it never penalizes, a cluster
 * scored on its remaining dimensions can still reach 100% of its full weight.
 * A cluster with nothing scored is null, not 0/0.
 */
export function clusterPercentages(
  scores: ReadonlyMap<number, number | null>,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const cluster of CLUSTERS) {
    const scored = DIMENSIONS.filter(
      (d) => d.cluster === cluster.name && scores.get(d.n) != null,
    );
    if (scored.length === 0) {
      out.set(cluster.name, null);
      continue;
    }
    const sum = scored.reduce((n, d) => n + (scores.get(d.n) as number), 0);
    out.set(cluster.name, (sum / (5 * scored.length)) * 100);
  }
  return out;
}

export interface ClusterContribution {
  name: string;
  weight: number;
  /** null when no dimension in the cluster was scored. */
  scorePct: number | null;
  /** Points contributed to the base score. */
  contribution: number;
}

/**
 * The base score: each cluster's percentage times its weight, summed over the
 * four clusters, on a 0-100 scale.
 */
export function composeBaseScore(scores: ReadonlyMap<number, number | null>): {
  base: number;
  clusters: ClusterContribution[];
} {
  const pct = clusterPercentages(scores);
  const clusters = CLUSTERS.map((c) => {
    const scorePct = pct.get(c.name) ?? null;
    return {
      name: c.name,
      weight: c.weight,
      scorePct,
      contribution: scorePct === null ? 0 : (scorePct / 100) * c.weight,
    };
  });
  return {
    base: clusters.reduce((n, c) => n + c.contribution, 0),
    clusters,
  };
}

/**
 * The two bonuses that sit on top of the weighted base (task 5.2).
 *
 * Derived from the 119 published reports in the bundled corpus, which fix the
 * rule exactly: `newcomerBonus` is the first-timer count capped at 5, and
 * `sizeBonus` starts at 16 attendees and adds half a point per head to a
 * maximum of 3. Every one of the 119 reproduces its published score from these
 * two numbers plus its base, so this is measured, not guessed.
 *
 * Publishing used to accept both as optional inputs and nothing ever computed
 * them, so every ported report scored base-only and a busy session with five
 * first-timers was rewarded exactly as much as an empty one.
 */
export const NEWCOMER_BONUS_MAX = 5;
export const SIZE_BONUS_MAX = 3;
/** The head count above which size starts to earn anything. */
export const SIZE_BONUS_THRESHOLD = 15;
export const SIZE_BONUS_PER_HEAD = 0.5;

export interface ScoreBonuses {
  newcomerBonus: number;
  sizeBonus: number;
}

export function composeBonuses(input: {
  attendees?: number | null;
  newcomers?: number | null;
}): ScoreBonuses {
  const attendees = Math.max(0, Math.floor(input.attendees ?? 0));
  const newcomers = Math.max(0, Math.floor(input.newcomers ?? 0));
  const size = (attendees - SIZE_BONUS_THRESHOLD) * SIZE_BONUS_PER_HEAD;
  return {
    newcomerBonus: Math.min(newcomers, NEWCOMER_BONUS_MAX),
    sizeBonus: Math.min(Math.max(size, 0), SIZE_BONUS_MAX),
  };
}

/**
 * The published composite: base plus bonuses, capped at 100.
 *
 * TWO decimals, which is what the 119 published reports carry (84.04, 95.76).
 * Publishing rounded to one, so a backfilled report and a new one computed from
 * the same numbers would have disagreed in the third digit, and a leader
 * comparing this month to last would have seen scores that do not line up.
 *
 * The cap matters because the base alone can reach 100 and the bonuses add up
 * to 8 more. Nothing in the corpus came close (95.76 is the highest), but every
 * surface renders the number as "x / 100", so a 103 would make the portal, the
 * email and the PDF all state something untrue.
 */
export function composeComposite(base: number, bonuses: ScoreBonuses): number {
  const total = base + bonuses.newcomerBonus + bonuses.sizeBonus;
  return Math.round(Math.min(total, 100) * 100) / 100;
}

export interface RubricContract {
  model: string;
  // Mutable copies, not the readonly definitions: this crosses the HTTP
  // boundary, and handing out the module's own arrays would let a caller mutate
  // the single source.
  clusters: RubricCluster[];
  dimensions: Array<RubricDimension & { clusterWeight: number }>;
  statusBands: StatusBand[];
  /** The 1-5 labels, so the portal does not keep its own copy. */
  dimensionBands: Array<{ min: number; label: string }>;
}

/**
 * The rubric as served over the API. Derived from the definitions above rather
 * than restated, which is what makes the single-source property hold across the
 * repo boundary: the portal renders what computed the score.
 */
export function rubricContract(): RubricContract {
  const weightOf = new Map(CLUSTERS.map((c) => [c.name, c.weight]));
  return {
    model: RUBRIC_MODEL_VERSION,
    clusters: CLUSTERS.map((c) => ({ ...c })),
    dimensions: DIMENSIONS.map((d) => ({
      ...d,
      clusterWeight: weightOf.get(d.cluster) ?? 0,
    })),
    statusBands: STATUS_BANDS.map((b) => ({ ...b })),
    dimensionBands: [5, 4, 3, 2, 1].map((min) => ({
      min,
      label: dimensionBandLabel(min),
    })),
  };
}
