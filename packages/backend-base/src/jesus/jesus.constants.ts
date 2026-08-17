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
  section: JesusSection;
  blurb: string;
  sortOrder: number;
}

export const JESUS_FACET_META: Record<JesusFacetType, JesusFacetMeta> = {
  TEACHING: {
    type: "TEACHING",
    mode: "WORD",
    slug: "teachings",
    label: "Teachings",
    singular: "Teaching",
    section: "words",
    blurb: "What He taught, and what it means",
    sortOrder: 1,
  },
  QUESTION: {
    type: "QUESTION",
    mode: "WORD",
    slug: "questions",
    label: "Questions",
    singular: "Question",
    section: "words",
    blurb: "The questions He asked, and why",
    sortOrder: 2,
  },
  COMMAND: {
    type: "COMMAND",
    mode: "WORD",
    slug: "commands",
    label: "Commands",
    singular: "Command",
    section: "words",
    blurb: "What He told His followers to do",
    sortOrder: 3,
  },
  CLAIM: {
    type: "CLAIM",
    mode: "WORD",
    slug: "claims",
    label: "Claims",
    singular: "Claim",
    section: "words",
    blurb: "What He said about Himself",
    sortOrder: 4,
  },
  PROMISE: {
    type: "PROMISE",
    mode: "WORD",
    slug: "promises",
    label: "Promises",
    singular: "Promise",
    section: "words",
    blurb: "What He pledged to those who follow",
    sortOrder: 5,
  },
  WARNING: {
    type: "WARNING",
    mode: "WORD",
    slug: "warnings",
    label: "Warnings",
    singular: "Warning",
    section: "words",
    blurb: "The hard sayings He refused to soften",
    sortOrder: 6,
  },
  PRAYER: {
    type: "PRAYER",
    mode: "WORD",
    slug: "prayers",
    label: "Prayers",
    singular: "Prayer",
    section: "words",
    blurb: "When He spoke to the Father",
    sortOrder: 7,
  },
  PROPHECY: {
    type: "PROPHECY",
    mode: "WORD",
    slug: "prophecies",
    label: "Prophecies",
    singular: "Prophecy",
    section: "words",
    blurb: "What He foretold",
    sortOrder: 8,
  },
  MIRACLE: {
    type: "MIRACLE",
    mode: "ACTION",
    slug: "miracles",
    label: "Miracles",
    singular: "Miracle",
    section: "actions",
    blurb: "Signs of the Kingdom breaking in",
    sortOrder: 9,
  },
  HEALING: {
    type: "HEALING",
    mode: "ACTION",
    slug: "healings",
    label: "Healings",
    singular: "Healing",
    section: "actions",
    blurb: "Every body He restored",
    sortOrder: 10,
  },
  ENCOUNTER: {
    type: "ENCOUNTER",
    mode: "ACTION",
    slug: "encounters",
    label: "Encounters",
    singular: "Encounter",
    section: "actions",
    blurb: "The people He met, one by one",
    sortOrder: 11,
  },
  COMPASSION: {
    type: "COMPASSION",
    mode: "ACTION",
    slug: "compassion",
    label: "Compassion",
    singular: "Act of compassion",
    section: "actions",
    blurb: "Where He stopped, touched, and wept",
    sortOrder: 12,
  },
  CONFRONTATION: {
    type: "CONFRONTATION",
    mode: "ACTION",
    slug: "confrontations",
    label: "Confrontations",
    singular: "Confrontation",
    section: "actions",
    blurb: "Where He refused to back down",
    sortOrder: 13,
  },
  SYMBOLIC_ACTION: {
    type: "SYMBOLIC_ACTION",
    mode: "ACTION",
    slug: "symbolic-actions",
    label: "Symbolic actions",
    singular: "Symbolic action",
    section: "actions",
    blurb: "Acted parables — the fig tree, the towel",
    sortOrder: 14,
  },
  PARABLE: {
    type: "PARABLE",
    mode: "WORD",
    slug: "parables",
    label: "Parables",
    singular: "Parable",
    section: "parables",
    blurb: "Every story He told",
    sortOrder: 15,
  },
};

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

/** The nine kinds an entry can take. Stored verbatim in `jesus_entries.kind`. */
export const JESUS_KINDS = [
  "TEACHING",
  "QUESTION",
  "COMMAND",
  "CLAIM",
  "MIRACLE",
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
  ENCOUNTER: {
    kind: "ENCOUNTER",
    slug: "encounters",
    label: "Encounters",
    singular: "Encounter",
    section: "actions",
    blurb: "The people He met, one by one",
    sortOrder: 6,
  },
  COMPASSION: {
    kind: "COMPASSION",
    slug: "compassion",
    label: "Compassion",
    singular: "Act of compassion",
    section: "actions",
    blurb: "Where He stopped, touched, and wept",
    sortOrder: 7,
  },
  CONFRONTATION: {
    kind: "CONFRONTATION",
    slug: "confrontations",
    label: "Confrontations",
    singular: "Confrontation",
    section: "actions",
    blurb: "Where He refused to back down",
    sortOrder: 8,
  },
  PARABLE: {
    kind: "PARABLE",
    slug: "parables",
    label: "Parables",
    singular: "Parable",
    section: "parables",
    blurb: "Every story He told",
    sortOrder: 9,
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
    blurb: "Miracles, encounters, compassion and confrontations",
    kinds: ["MIRACLE", "ENCOUNTER", "COMPASSION", "CONFRONTATION"],
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
