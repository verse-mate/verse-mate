/**
 * Canonical vocabulary for the Jesus feature.
 *
 * Both the API and the clients (web + mobile) render the hub from
 * `GET /jesus/overview`, which is built from these constants. Keeping the
 * vocabulary in one place means adding a new kind — say `PRAYER` — is a
 * backend-only change that both clients pick up without a release.
 */

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
