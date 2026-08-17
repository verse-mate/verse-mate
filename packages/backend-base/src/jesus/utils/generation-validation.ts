/**
 * Validation gates for generated Jesus content.
 *
 * The spec's rule is that a level-1 assertion may contain only what is
 * explicitly present in the passage handed to the model. These functions make
 * that rule mechanical: a record that breaks it is rejected, not downgraded.
 * Everything here is pure so the gates can be unit-tested without a model, a
 * database or a network.
 */

export interface ScriptureReference {
  book: string;
  chapter: number;
  verse?: number;
}

/**
 * Pull scripture references out of prose.
 *
 * Book names are supplied rather than hardcoded so the caller controls the
 * canon (and so the matcher stays correct for localized book names). Longer
 * names are tried first — otherwise "John" would match inside "1 John".
 */
export function extractReferences(
  text: string,
  bookNames: string[],
): ScriptureReference[] {
  if (!text.trim() || bookNames.length === 0) return [];

  const escaped = [...bookNames]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  const pattern = new RegExp(
    `\\b(${escaped.join("|")})\\s+(\\d+)(?::(\\d+))?`,
    "g",
  );

  const found: ScriptureReference[] = [];
  for (const match of text.matchAll(pattern)) {
    found.push({
      book: match[1],
      chapter: Number.parseInt(match[2], 10),
      verse: match[3] ? Number.parseInt(match[3], 10) : undefined,
    });
  }
  return found;
}

/** `"Mark"` + chapter 4 → the key used to compare against an event's scope. */
export function referenceKey(book: string, chapter: number): string {
  return `${book.toLowerCase()}|${chapter}`;
}

/**
 * References in the text that fall outside the event's own accounts.
 *
 * Applied to `overview` and `compare`, which must describe this event and not
 * wander into passages the model was never shown. Deliberately NOT applied to
 * `insights`, where drawing on other scripture is the whole point.
 */
export function findOutOfScopeReferences(
  text: string,
  bookNames: string[],
  allowed: Iterable<string>,
): ScriptureReference[] {
  const allowedSet = new Set(allowed);
  return extractReferences(text, bookNames).filter(
    (ref) => !allowedSet.has(referenceKey(ref.book, ref.chapter)),
  );
}

/**
 * Normalize for comparison: drop case, curly quotes, punctuation and repeated
 * whitespace. Translations differ on punctuation and the model may re-quote
 * with straight quotes, neither of which should count as ungrounded.
 */
export function normalizeForMatch(text: string): string {
  return (
    text
      .toLowerCase()
      // Quotation marks are delimiters, not content — drop them. Apostrophes
      // are content ("don't"), so they survive the next step and are only
      // trimmed where they sit at a word boundary and must have been a quote.
      .replace(/[“”"]/g, " ")
      .replace(/[‘’]/g, "'")
      .replace(/[^\p{L}\p{N}\s']/gu, " ")
      .replace(/(^|\s)'+/g, "$1")
      .replace(/'+(\s|$)/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Is this quotation actually in the passage the model was given?
 *
 * The check is containment after normalization. An ellipsis splits the
 * quotation into fragments, each of which must appear — that allows the honest
 * "Peace! … Be still!" without allowing a fabricated middle.
 */
export function isQuotationGrounded(
  quotation: string,
  sourceText: string,
): boolean {
  const source = normalizeForMatch(sourceText);
  if (!source) return false;

  const fragments = quotation
    .split(/…|\.\.\./)
    .map(normalizeForMatch)
    .filter((f) => f.length > 0);

  if (fragments.length === 0) return false;
  return fragments.every((fragment) => source.includes(fragment));
}

export interface ValidationIssue {
  rule: string;
  detail: string;
}

/** Signals that the model declined or hedged instead of answering. */
const REFUSAL_PATTERNS = [
  /\bI(?:'m| am) (?:sorry|unable)\b/i,
  /\bas an AI\b/i,
  /\bI cannot (?:provide|generate|assist)\b/i,
  /\bI don'?t have (?:access|enough) /i,
];

/**
 * Gate a generated narrative before it is stored.
 *
 * Returns issues rather than throwing so a batch run can record which events
 * failed and why, and re-run only those.
 */
export function validateNarrative(input: {
  content: string;
  type: string;
  bookNames: string[];
  /** `book|chapter` keys for the event's own passages. */
  allowedReferences: Iterable<string>;
  minLength?: number;
  maxLength?: number;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const content = input.content?.trim() ?? "";
  const minLength = input.minLength ?? 40;
  const maxLength = input.maxLength ?? 12000;

  if (!content) {
    issues.push({ rule: "non-empty", detail: "content is empty" });
    return issues;
  }
  if (content.length < minLength) {
    issues.push({
      rule: "min-length",
      detail: `${content.length} chars, minimum ${minLength}`,
    });
  }
  if (content.length > maxLength) {
    issues.push({
      rule: "max-length",
      detail: `${content.length} chars, maximum ${maxLength}`,
    });
  }

  for (const pattern of REFUSAL_PATTERNS) {
    if (pattern.test(content)) {
      issues.push({
        rule: "refusal",
        detail: `matched ${pattern}`,
      });
      break;
    }
  }

  // Only the tabs that must stay inside this event are scope-checked.
  if (input.type === "overview" || input.type === "compare") {
    const stray = findOutOfScopeReferences(
      content,
      input.bookNames,
      input.allowedReferences,
    );
    if (stray.length > 0) {
      issues.push({
        rule: "reference-scope",
        detail: `references outside the event: ${stray
          .map((r) => `${r.book} ${r.chapter}`)
          .join(", ")}`,
      });
    }
  }

  return issues;
}

export interface ExtractedFacet {
  mode: "WORD" | "ACTION";
  type: string;
  speaker?: string | null;
  actor?: string | null;
  title: string;
  text?: string | null;
  reference?: string | null;
}

/**
 * Gate an extraction result.
 *
 * A WORD facet claims Jesus said something, so its quoted text must be present
 * in the supplied passage — this is the check that stops a plausible-sounding
 * invented saying reaching the database at level 1. ACTION facets describe
 * rather than quote, so they are not string-matched; they are stored at level 2
 * unless a reviewer promotes them.
 */
export function validateExtraction(input: {
  facets: ExtractedFacet[];
  /** The verse text the model was given, concatenated. */
  sourceText: string;
  allowedTypes: readonly string[];
}): {
  valid: ExtractedFacet[];
  rejected: Array<{ facet: ExtractedFacet; issues: ValidationIssue[] }>;
} {
  const valid: ExtractedFacet[] = [];
  const rejected: Array<{ facet: ExtractedFacet; issues: ValidationIssue[] }> =
    [];

  for (const facet of input.facets) {
    const issues: ValidationIssue[] = [];

    if (!facet.title?.trim()) {
      issues.push({ rule: "title", detail: "missing title" });
    }
    if (!input.allowedTypes.includes(facet.type)) {
      issues.push({ rule: "type", detail: `unknown type "${facet.type}"` });
    }
    if (facet.mode !== "WORD" && facet.mode !== "ACTION") {
      issues.push({ rule: "mode", detail: `unknown mode "${facet.mode}"` });
    }
    if (facet.mode === "WORD" && !facet.speaker) {
      issues.push({ rule: "speaker", detail: "a WORD facet needs a speaker" });
    }
    if (facet.mode === "ACTION" && !facet.actor) {
      issues.push({ rule: "actor", detail: "an ACTION facet needs an actor" });
    }
    if (facet.mode === "WORD" && facet.text) {
      if (!isQuotationGrounded(facet.text, input.sourceText)) {
        issues.push({
          rule: "quotation-grounded",
          detail: `quotation not found in the supplied passage: "${facet.text.slice(0, 60)}"`,
        });
      }
    }

    if (issues.length) rejected.push({ facet, issues });
    else valid.push(facet);
  }

  return { valid, rejected };
}
