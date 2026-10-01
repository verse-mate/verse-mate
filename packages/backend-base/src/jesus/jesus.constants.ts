/**
 * Canonical vocabulary for the Jesus feature.
 *
 * Both the API and the clients (web + mobile) render the hub from
 * `GET /jesus/overview`, which is built from these constants. Keeping the
 * vocabulary in one place means adding a new kind — say `PRAYER` — is a
 * backend-only change that both clients pick up without a release.
 */

// ── Facet taxonomy (the event graph) ──────────────────────────────────────
//
// A facet is one thing Jesus said or did, hanging off an event. `mode` answers
// "speech or deed"; `type` is the browse category. The six types beyond the
// original nine — PROMISE, WARNING, PRAYER, PROPHECY, HEALING and
// SYMBOLIC_ACTION — are what the event model makes expressible: under the old
// single-`kind` column a warning had to be smuggled in as a theme.

export const JESUS_FACET_MODES = ["WORD", "ACTION"] as const;
export type JesusFacetMode = (typeof JESUS_FACET_MODES)[number];

export const JESUS_FACET_TYPES = [
  // Words
  "TEACHING",
  "PARABLE",
  "QUESTION",
  "COMMAND",
  "CLAIM",
  "PROMISE",
  "WARNING",
  "PRAYER",
  "PROPHECY",
  // Actions
  "MIRACLE",
  "HEALING",
  "ENCOUNTER",
  "COMPASSION",
  "CONFRONTATION",
  "SYMBOLIC_ACTION",
] as const;

export type JesusFacetType = (typeof JESUS_FACET_TYPES)[number];

export interface JesusFacetMeta {
  type: JesusFacetType;
  mode: JesusFacetMode;
  slug: string;
  label: string;
  singular: string;
  /**
   * The noun to count with, lower-case: "8 teachings", "3 acts of compassion".
   * Not derivable from `label` — "Compassion" is a plural label but not a
   * countable one — so it is stated rather than pluralized at the call site.
   */
  plural: string;
  section: JesusSection;
  blurb: string;
  /**
   * The paragraph at the top of the category's browse screen. Where `blurb`
   * labels the category in a nav card, this frames what the reader is about to
   * work through and says how it is organised.
   */
  intro: string;
  sortOrder: number;
}

export const JESUS_FACET_META: Record<JesusFacetType, JesusFacetMeta> = {
  TEACHING: {
    type: "TEACHING",
    mode: "WORD",
    slug: "teachings",
    label: "Teachings",
    singular: "Teaching",
    plural: "teachings",
    section: "words",
    blurb: "What He taught, and what it means",
    intro:
      "Jesus taught in synagogues, on hillsides and at dinner tables, and He returned to the same handful of subjects again and again. Gathered by topic below: what He says about each, and where He says it.",
    sortOrder: 1,
  },
  QUESTION: {
    type: "QUESTION",
    mode: "WORD",
    slug: "questions",
    label: "Questions",
    singular: "Question",
    plural: "questions",
    section: "words",
    blurb: "The questions He asked, and why",
    intro:
      "Jesus asked far more questions than He answered. Gathered by topic below: what each line of questioning is probing, and where He asks it.",
    sortOrder: 2,
  },
  COMMAND: {
    type: "COMMAND",
    mode: "WORD",
    slug: "commands",
    label: "Commands",
    singular: "Command",
    plural: "commands",
    section: "words",
    blurb: "What He told His followers to do",
    intro:
      "Jesus told His followers to do specific things. Gathered by topic below: what He asks of them in each area of life, and where He asks it.",
    sortOrder: 3,
  },
  CLAIM: {
    type: "CLAIM",
    mode: "WORD",
    slug: "claims",
    label: "Claims",
    singular: "Claim",
    plural: "claims",
    section: "words",
    blurb: "What He said about Himself",
    intro:
      "Jesus said things about Himself that leave no neutral ground. Gathered by topic below: what He claims in each direction, and where He claims it.",
    sortOrder: 4,
  },
  PROMISE: {
    type: "PROMISE",
    mode: "WORD",
    slug: "promises",
    label: "Promises",
    singular: "Promise",
    plural: "promises",
    section: "words",
    blurb: "What He pledged to those who follow",
    intro:
      "Jesus pledged things to those who follow Him. Gathered by topic below: what He promises in each area, and where He promises it.",
    sortOrder: 5,
  },
  WARNING: {
    type: "WARNING",
    mode: "WORD",
    slug: "warnings",
    label: "Warnings",
    singular: "Warning",
    plural: "warnings",
    section: "words",
    blurb: "The hard sayings He refused to soften",
    intro:
      "Jesus warned plainly and refused to soften it. Gathered by topic below: what He warns about in each area, and where He warns it.",
    sortOrder: 6,
  },
  PRAYER: {
    type: "PRAYER",
    mode: "WORD",
    slug: "prayers",
    label: "Prayers",
    singular: "Prayer",
    plural: "prayers",
    section: "words",
    blurb: "When He spoke to the Father",
    intro:
      "Jesus prayed in public and alone, and the Gospels preserve the words. Gathered by topic below: what He brings to the Father, and where.",
    sortOrder: 7,
  },
  PROPHECY: {
    type: "PROPHECY",
    mode: "WORD",
    slug: "prophecies",
    label: "Prophecies",
    singular: "Prophecy",
    plural: "prophecies",
    section: "words",
    blurb: "What He foretold",
    intro:
      "Jesus foretold what was coming — for Himself, for Jerusalem, for His followers. Gathered by topic below: what He foretells in each direction, and where.",
    sortOrder: 8,
  },
  MIRACLE: {
    type: "MIRACLE",
    mode: "ACTION",
    slug: "miracles",
    label: "Miracles",
    singular: "Miracle",
    plural: "miracles",
    section: "actions",
    blurb: "Signs of the Kingdom breaking in",
    intro:
      "Jesus' signs were never only relief; each one says something. Gathered by topic below: what the signs show in each area, and where they happen.",
    sortOrder: 9,
  },
  HEALING: {
    type: "HEALING",
    mode: "ACTION",
    slug: "healings",
    label: "Healings",
    singular: "Healing",
    plural: "healings",
    section: "actions",
    blurb: "Every body He restored",
    intro:
      "Jesus restored bodies, and each healing carries a point beyond the body. Gathered by topic below: who He heals, what it shows, and where.",
    sortOrder: 10,
  },
  ENCOUNTER: {
    type: "ENCOUNTER",
    mode: "ACTION",
    slug: "encounters",
    label: "Encounters",
    singular: "Encounter",
    plural: "encounters",
    section: "actions",
    blurb: "The people He met, one by one",
    intro:
      "Jesus met people one at a time and treated no two the same. Gathered by topic below: who He meets, what changes, and where.",
    sortOrder: 11,
  },
  COMPASSION: {
    type: "COMPASSION",
    mode: "ACTION",
    slug: "compassion",
    label: "Compassion",
    singular: "Act of compassion",
    plural: "acts of compassion",
    section: "actions",
    blurb: "Where He stopped, touched, and wept",
    intro:
      "Jesus stopped, touched, and wept. Gathered by topic below: who He turns toward, what it costs Him, and where.",
    sortOrder: 12,
  },
  CONFRONTATION: {
    type: "CONFRONTATION",
    mode: "ACTION",
    slug: "confrontations",
    label: "Confrontations",
    singular: "Confrontation",
    plural: "confrontations",
    section: "actions",
    blurb: "Where He refused to back down",
    intro:
      "Jesus refused to back down, and the Gospels record who He faced. Gathered by topic below: what is at stake in each clash, and where.",
    sortOrder: 13,
  },
  SYMBOLIC_ACTION: {
    type: "SYMBOLIC_ACTION",
    mode: "ACTION",
    slug: "symbolic-actions",
    label: "Symbolic actions",
    singular: "Symbolic action",
    plural: "symbolic actions",
    section: "actions",
    blurb: "Acted parables — the fig tree, the towel",
    intro:
      "Jesus acted His message out — the fig tree, the towel, the temple tables. Gathered by topic below: what each act means, and where.",
    sortOrder: 14,
  },
  PARABLE: {
    type: "PARABLE",
    mode: "WORD",
    slug: "parables",
    label: "Parables",
    singular: "Parable",
    plural: "parables",
    section: "parables",
    blurb: "Every story He told",
    intro:
      "Jesus told stories that hide as much as they reveal. Gathered by topic below: what each set of stories is about, and where He tells them.",
    sortOrder: 15,
  },
};

// ── Coverage targets ──────────────────────────────────────────────────────
//
// Roughly how much content a category should carry before it reads as thin, or
// as padded. Without a number "the encounters are under-represented" is a
// matter of opinion and nothing can act on it; with one, `jesus:coverage`
// reports it and `jesus:extract` fills toward it.
//
// **These are approximate and are meant to be.** They come from published
// harmonies, which disagree with each other, because the disagreements are
// classification questions — is "he healed many" one miracle or many? is a
// saying repeated in three Gospels one command or three? — rather than
// doctrinal ones. There is no inspired total for any of these categories and
// Scripture makes one underivable: the narrated episodes are samples, and John
// 21:25 closes by saying so.
//
// So nothing here is an acceptance criterion. A count near its band is fine, a
// count well outside it is a question worth looking at, and neither is a build
// failure. `COVERAGE_TOLERANCE` is what keeps the difference honest: a category
// has to be clearly out before anything reports it as out.

export interface JesusCategoryTarget {
  /** Roughly the fewest before the category reads as thin. */
  min: number;
  /** Roughly the most before it reads as padded — usually one event dominating. */
  max: number;
  /**
   * What the range counts, where it is not one facet per episode. Questions
   * are the notable case: ~300 counts every direct interrogative including
   * repetitions across parallel accounts, not distinct questions.
   */
  unit?: string;
}

/**
 * How far outside its band a count may sit before anything reports it.
 *
 * The bands are approximations, so treating their edges as exact would invent
 * precision the sources do not have — flagging 34 parables against a band of
 * 35-40 says the catalogues agree to the unit, and they do not. 20% is wide
 * enough that only a real gap trips it.
 */
export const COVERAGE_TOLERANCE = 0.2;

/**
 * What a fill run should aim at: the middle of the band, not its floor.
 *
 * Aiming at `min` lands every category at the thin end of an approximate range
 * and makes the exact boundary matter, which is the thing these numbers cannot
 * support.
 */
export function fillGoal(target: JesusCategoryTarget): number {
  return Math.round((target.min + target.max) / 2);
}

export const JESUS_CATEGORY_TARGETS: Partial<
  Record<JesusFacetType, JesusCategoryTarget>
> = {
  // Words
  TEACHING: { min: 60, max: 80, unit: "distinct teaching units" },
  PARABLE: { min: 35, max: 40 },
  QUESTION: {
    min: 300,
    max: 310,
    unit: "every direct interrogative, repetitions included",
  },
  COMMAND: {
    min: 50,
    max: 60,
    unit: "enduring commands, not every imperative",
  },
  CLAIM: { min: 50, max: 70, unit: "distinct self-claims, parallels merged" },
  WARNING: { min: 40, max: 50 },
  PRAYER: { min: 20, max: 25, unit: "occasions He is shown praying" },
  PROPHECY: { min: 30, max: 40, unit: "prophetic units, parallels merged" },
  // Actions. Miracle and Healing split one traditional catalogue of ~37
  // between them, so neither range means much alone — `assessCoverage` reports
  // them together as well.
  MIRACLE: { min: 12, max: 20 },
  HEALING: { min: 17, max: 25 },
  ENCOUNTER: { min: 50, max: 60, unit: "narrated personal encounters" },
  COMPASSION: { min: 15, max: 20, unit: "touch / weeping episodes" },
  CONFRONTATION: { min: 15, max: 20 },
  // PROMISE and SYMBOLIC_ACTION have no published range to anchor on, so they
  // are deliberately untargeted rather than given an invented one.
};

/** The two types that split the traditional miracle catalogue between them. */
export const MIRACLE_CATALOGUE_TYPES = ["MIRACLE", "HEALING"] as const;

/** The traditional catalogue the two of them together should cover. */
export const MIRACLE_CATALOGUE_TARGET: JesusCategoryTarget = {
  min: 37,
  max: 45,
};

export type JesusCoverageStatus = "under" | "ok" | "over" | "untargeted";

export interface JesusCoverageRow {
  type: JesusFacetType;
  label: string;
  count: number;
  target: JesusCategoryTarget | null;
  status: JesusCoverageStatus;
  /**
   * Roughly how far outside the band it sits — short of `min`, or over `max`.
   * 0 when the count is in the band or within tolerance of it. Approximate,
   * like everything else here: useful for "is this a big gap or a small one",
   * not for planning to the unit.
   */
  delta: number;
  /** What a fill run aims at, the middle of the band. Null when untargeted. */
  goal: number | null;
}

/**
 * Compare per-type facet counts against the targets.
 *
 * Takes counts rather than reading them, so the same function serves the
 * report (counts from the database), the extraction script (deciding which
 * types still need filling) and the tests (counts made up).
 *
 * A count is only reported out-of-band once it is `COVERAGE_TOLERANCE` beyond
 * the edge, because the bands are approximate — see the note above them.
 */
export function assessCoverage(
  counts: Partial<Record<JesusFacetType, number>>,
): JesusCoverageRow[] {
  return JESUS_FACET_TYPES.map((type) => {
    const count = counts[type] ?? 0;
    const target = JESUS_CATEGORY_TARGETS[type] ?? null;

    if (!target) {
      return {
        type,
        label: JESUS_FACET_META[type].label,
        count,
        target: null,
        status: "untargeted" as const,
        delta: 0,
        goal: null,
      };
    }

    const floor = target.min * (1 - COVERAGE_TOLERANCE);
    const ceiling = target.max * (1 + COVERAGE_TOLERANCE);

    const status =
      count < floor ? "under" : count > ceiling ? "over" : ("ok" as const);
    // Measured from the band itself rather than from the tolerance edge, so
    // the number answers "how far from where it should be".
    const delta =
      status === "under"
        ? target.min - count
        : status === "over"
          ? count - target.max
          : 0;

    return {
      type,
      label: JESUS_FACET_META[type].label,
      count,
      target,
      status,
      delta,
      goal: fillGoal(target),
    };
  });
}

/** The types clearly short of their band, biggest gap first. */
export function typesUnderTarget(
  counts: Partial<Record<JesusFacetType, number>>,
): JesusFacetType[] {
  return assessCoverage(counts)
    .filter((r) => r.status === "under")
    .sort((a, b) => b.delta - a.delta)
    .map((r) => r.type);
}

const FACET_TYPE_BY_SLUG = new Map<string, JesusFacetType>(
  JESUS_FACET_TYPES.map((t) => [JESUS_FACET_META[t].slug, t]),
);

export function isJesusFacetType(value: string): value is JesusFacetType {
  return (JESUS_FACET_TYPES as readonly string[]).includes(value);
}

/** `"miracles"` → `"MIRACLE"`, and `"MIRACLE"` → `"MIRACLE"`. */
export function getFacetTypeFromSlug(slug: string): JesusFacetType | null {
  const upper = slug.toUpperCase();
  if (isJesusFacetType(upper)) return upper;
  return FACET_TYPE_BY_SLUG.get(slug.toLowerCase()) ?? null;
}

/**
 * Resolve `?type=` / `?section=` / `?mode=` into a facet-type filter.
 *
 * Same three-outcome contract as `resolveKindFilter`: undefined means don't
 * filter, a populated array means filter to these, and an empty array means the
 * caller named something the taxonomy doesn't have — which must match nothing
 * rather than everything.
 */
export function resolveFacetTypeFilter(input: {
  type?: string;
  section?: string;
  mode?: string;
}): JesusFacetType[] | undefined {
  if (input.type) {
    const resolved = getFacetTypeFromSlug(input.type);
    return resolved ? [resolved] : [];
  }
  if (input.section) {
    const section = input.section.toLowerCase();
    if (!isJesusSection(section)) return [];
    return JESUS_FACET_TYPES.filter(
      (t) => JESUS_FACET_META[t].section === section,
    );
  }
  if (input.mode) {
    const mode = input.mode.toUpperCase();
    if (!(JESUS_FACET_MODES as readonly string[]).includes(mode)) return [];
    return JESUS_FACET_TYPES.filter((t) => JESUS_FACET_META[t].mode === mode);
  }
  return undefined;
}

/** Confidence values the UI knows how to hedge. Mirrors the DB check constraints. */
export const JESUS_CONFIDENCE_LEVELS = [
  "high",
  "probable",
  "disputed",
] as const;
export type JesusConfidenceLevel = (typeof JESUS_CONFIDENCE_LEVELS)[number];

/**
 * Provenance of an assertion — the answer to "how do you know that?".
 *   1 explicitly present in the biblical text
 *   2 interpretation of the passage in its own context
 *   3 theological synthesis across passages
 */
export const JESUS_PROVENANCE = {
  SCRIPTURE: 1,
  INTERPRETATION: 2,
  SYNTHESIS: 3,
} as const;

/** Channels for "what this event reveals", kept apart so voices don't merge. */
export const JESUS_REVEAL_CHANNELS = [
  "SAYS_ABOUT_HIMSELF",
  "DEMONSTRATES",
  "OTHERS_SAY",
  "NARRATOR_SAYS",
] as const;
export type JesusRevealChannel = (typeof JESUS_REVEAL_CHANNELS)[number];

/**
 * How many related events a Jesus detail response offers.
 *
 * Three is a suggestion for what to read next, not a browse view. The feature
 * already has real browse views — the theme pages and "Follow His Life" — that
 * a reader reaches by tapping the theme rather than by scrolling past a column
 * of cards at the foot of the passage they came to read.
 *
 * Shared by the event graph and the legacy entry endpoints so one number
 * governs the whole feature.
 */
export const JESUS_RELATED_LIMIT = 3;

/** Generated narrative attached to an event. */
export const JESUS_EVENT_EXPLANATION_TYPES = [
  "overview",
  "compare",
  "insights",
  "application",
] as const;
export type JesusEventExplanationType =
  (typeof JESUS_EVENT_EXPLANATION_TYPES)[number];

// ── Legacy entry taxonomy ─────────────────────────────────────────────────
// Retained while `/jesus/entries` is still served. Superseded by the facet
// taxonomy above; remove with the entry endpoints.

/**
 * The ten kinds an entry can take. Stored verbatim in `jesus_entries.kind`.
 *
 * `HEALING` arrived with the corpus before it arrived here, and a kind the
 * corpus writes but this list omits is invisible rather than loud: it is
 * dropped from the hub's kind counts, from `?kind=`, from `?section=`, and
 * from every collection that filters on kinds. Twenty-two healings sat in the
 * database and nowhere on the screen. **Anything `SeedKind` can be must appear
 * here.**
 */
export const JESUS_KINDS = [
  "TEACHING",
  "QUESTION",
  "COMMAND",
  "CLAIM",
  "MIRACLE",
  "HEALING",
  "ENCOUNTER",
  "COMPASSION",
  "CONFRONTATION",
  "PARABLE",
] as const;

export type JesusKind = (typeof JESUS_KINDS)[number];

/** Top-level groupings on the hub screen. */
export const JESUS_SECTIONS = ["words", "actions", "parables"] as const;

export type JesusSection = (typeof JESUS_SECTIONS)[number];

export interface JesusKindMeta {
  kind: JesusKind;
  /** URL segment: /jesus/<slug> */
  slug: string;
  /** Plural label for the browse card ("Miracles"). */
  label: string;
  /** Singular label used on a detail screen's eyebrow ("Miracle"). */
  singular: string;
  section: JesusSection;
  /** One-line blurb shown under the label on the hub. */
  blurb: string;
  sortOrder: number;
}

export const JESUS_KIND_META: Record<JesusKind, JesusKindMeta> = {
  TEACHING: {
    kind: "TEACHING",
    slug: "teachings",
    label: "Teachings",
    singular: "Teaching",
    section: "words",
    blurb: "What He taught, and what it means",
    sortOrder: 1,
  },
  QUESTION: {
    kind: "QUESTION",
    slug: "questions",
    label: "Questions",
    singular: "Question",
    section: "words",
    blurb: "The questions He asked, and why",
    sortOrder: 2,
  },
  COMMAND: {
    kind: "COMMAND",
    slug: "commands",
    label: "Commands",
    singular: "Command",
    section: "words",
    blurb: "What He told His followers to do",
    sortOrder: 3,
  },
  CLAIM: {
    kind: "CLAIM",
    slug: "claims",
    label: "Claims",
    singular: "Claim",
    section: "words",
    blurb: "What He said about Himself",
    sortOrder: 4,
  },
  MIRACLE: {
    kind: "MIRACLE",
    slug: "miracles",
    label: "Miracles",
    singular: "Miracle",
    section: "actions",
    blurb: "Signs of the Kingdom breaking in",
    sortOrder: 5,
  },
  HEALING: {
    kind: "HEALING",
    slug: "healings",
    label: "Healings",
    singular: "Healing",
    section: "actions",
    blurb: "Every body He restored",
    sortOrder: 6,
  },
  ENCOUNTER: {
    kind: "ENCOUNTER",
    slug: "encounters",
    label: "Encounters",
    singular: "Encounter",
    section: "actions",
    blurb: "The people He met, one by one",
    sortOrder: 7,
  },
  COMPASSION: {
    kind: "COMPASSION",
    slug: "compassion",
    label: "Compassion",
    singular: "Act of compassion",
    section: "actions",
    blurb: "Where He stopped, touched, and wept",
    sortOrder: 8,
  },
  CONFRONTATION: {
    kind: "CONFRONTATION",
    slug: "confrontations",
    label: "Confrontations",
    singular: "Confrontation",
    section: "actions",
    blurb: "Where He refused to back down",
    sortOrder: 9,
  },
  PARABLE: {
    kind: "PARABLE",
    slug: "parables",
    label: "Parables",
    singular: "Parable",
    section: "parables",
    blurb: "Every story He told",
    sortOrder: 10,
  },
};

export interface JesusSectionMeta {
  section: JesusSection;
  label: string;
  blurb: string;
  kinds: JesusKind[];
  sortOrder: number;
}

export const JESUS_SECTION_META: Record<JesusSection, JesusSectionMeta> = {
  words: {
    section: "words",
    label: "His Words",
    blurb: "Teachings, questions, commands and claims",
    kinds: ["TEACHING", "QUESTION", "COMMAND", "CLAIM"],
    sortOrder: 1,
  },
  actions: {
    section: "actions",
    label: "His Actions",
    blurb: "Miracles, healings, encounters, compassion and confrontations",
    kinds: ["MIRACLE", "HEALING", "ENCOUNTER", "COMPASSION", "CONFRONTATION"],
    sortOrder: 2,
  },
  parables: {
    section: "parables",
    label: "Parables",
    blurb: "Study all of Jesus' parables",
    kinds: ["PARABLE"],
    sortOrder: 3,
  },
};

export const JESUS_EXPLANATION_TYPES = [
  "summary",
  "byline",
  "detailed",
] as const;

export type JesusExplanationType = (typeof JESUS_EXPLANATION_TYPES)[number];

/** Entity discriminators for `jesus_label_translations.entity_type`. */
export const JESUS_LABEL_ENTITY_TYPES = [
  "period",
  "theme",
  "collection",
] as const;

export type JesusLabelEntityType = (typeof JESUS_LABEL_ENTITY_TYPES)[number];

const KIND_BY_SLUG = new Map<string, JesusKind>(
  JESUS_KINDS.map((kind) => [JESUS_KIND_META[kind].slug, kind]),
);

/** `"miracles"` → `"MIRACLE"`. Returns null for unknown slugs. */
export function getKindFromSlug(slug: string): JesusKind | null {
  return KIND_BY_SLUG.get(slug.toLowerCase()) ?? null;
}

export function isJesusKind(value: string): value is JesusKind {
  return (JESUS_KINDS as readonly string[]).includes(value);
}

export function isJesusSection(value: string): value is JesusSection {
  return (JESUS_SECTIONS as readonly string[]).includes(value);
}

/** The kinds belonging to a section, e.g. `"words"` → the four speech kinds. */
export function getKindsForSection(section: JesusSection): JesusKind[] {
  return JESUS_SECTION_META[section].kinds;
}

/**
 * Translate the public `?kind=` / `?section=` query params into a kind filter.
 *
 * Three distinct outcomes, and the difference between the last two matters:
 *   - `undefined` — neither param given, so don't filter on kind at all.
 *   - a non-empty array — filter to these kinds.
 *   - an empty array — the caller named a kind or section the taxonomy does
 *     not have. That must narrow to nothing; answering a typo with the entire
 *     corpus would look like every entry matched.
 *
 * `kind` wins over `section` when both are supplied, since it is the narrower
 * of the two.
 */
export function resolveKindFilter(input: {
  kind?: string;
  section?: string;
}): JesusKind[] | undefined {
  if (input.kind) {
    const kind = input.kind.toUpperCase();
    // Accept both the stored form ("MIRACLE") and the URL slug ("miracles").
    if (isJesusKind(kind)) return [kind];
    const fromSlug = getKindFromSlug(input.kind);
    return fromSlug ? [fromSlug] : [];
  }

  if (input.section) {
    const section = input.section.toLowerCase();
    return isJesusSection(section) ? getKindsForSection(section) : [];
  }

  return undefined;
}
