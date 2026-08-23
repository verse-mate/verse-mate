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
  /**
   * Book name → how many chapters it actually has. Optional, but supplying it
   * is what stops prose being read as a citation: the pattern is
   * `<book> <number>`, and narrative legitimately puts a number after a book
   * name. The Sower's compare text says the yields differ — "Matthew 100,
   * sixty, thirty; Mark 30…" — and that was read as *Matthew chapter 100*,
   * failing the scope gate and throwing away an otherwise good record about
   * one of the better-known parables. Matthew has 28 chapters, so the claim
   * was refutable from data already in the database.
   */
  chapterCounts?: ReadonlyMap<string, number>,
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
    const book = match[1];
    const chapter = Number.parseInt(match[2], 10);

    // A chapter past the end of the book is not a reference to somewhere out
    // of scope — it is not a reference at all.
    const max = chapterCounts?.get(book);
    if (max !== undefined && (chapter < 1 || chapter > max)) continue;

    found.push({
      book,
      chapter,
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
  chapterCounts?: ReadonlyMap<string, number>,
): ScriptureReference[] {
  const allowedSet = new Set(allowed);
  return extractReferences(text, bookNames, chapterCounts).filter(
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
  /** Book name → chapter count, so prose numbers are not read as citations. */
  chapterCounts?: ReadonlyMap<string, number>;
  /** `book|chapter` keys for the event's own passages. */
  allowedReferences: Iterable<string>;
  minLength?: number;
  maxLength?: number;
  /**
   * Force the scope gate on or off instead of deriving it from `type`. Topic
   * briefs are not one of the event tabs but are just as bound to the passages
   * they were shown, so they set this rather than borrowing another type's name
   * to inherit its behaviour.
   */
  enforceReferenceScope?: boolean;
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
  const scoped =
    input.enforceReferenceScope ??
    (input.type === "overview" || input.type === "compare");
  if (scoped) {
    const stray = findOutOfScopeReferences(
      content,
      input.bookNames,
      input.allowedReferences,
      input.chapterCounts,
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

/**
 * Gate a topic brief before it is stored.
 *
 * A brief describes what Jesus teaches, asks or claims about one theme, and it
 * is written from a list of His sayings in that theme rather than from a single
 * passage. Two things follow, and both are checked here:
 *
 *  1. It must stay inside the passages it was shown. A brief about the Kingdom
 *     that reaches for Revelation is describing something the generator never
 *     handed it.
 *  2. Anything it puts in quotation marks must actually be one of those
 *     sayings. This is the gate that stops a fluent, plausible, invented
 *     quotation being filed as something Jesus said.
 *
 * Length is bounded tightly: this is a paragraph above a list, and a brief that
 * runs to an essay breaks the screen it was written for.
 */
export function validateTopicBrief(input: {
  content: string;
  bookNames: string[];
  chapterCounts?: ReadonlyMap<string, number>;
  /** `book|chapter` keys for the passages behind this topic's events. */
  allowedReferences: Iterable<string>;
  /** The sayings the model was given, concatenated. */
  sourceText: string;
  minLength?: number;
  maxLength?: number;
}): ValidationIssue[] {
  const issues = validateNarrative({
    content: input.content,
    type: "topic-brief",
    bookNames: input.bookNames,
    chapterCounts: input.chapterCounts,
    allowedReferences: input.allowedReferences,
    minLength: input.minLength ?? 120,
    maxLength: input.maxLength ?? 900,
    enforceReferenceScope: true,
  });

  for (const quotation of extractQuotations(input.content)) {
    if (!isQuotationGrounded(quotation, input.sourceText)) {
      issues.push({
        rule: "quotation-grounded",
        detail: `quotation not among this topic's sayings: "${quotation.slice(0, 60)}"`,
      });
    }
  }

  return issues;
}

/**
 * Quoted spans in prose, straight or curly.
 *
 * Apostrophes are not treated as quote marks: "the Father's house" is not a
 * quotation, and reading it as one would fail every brief that used a
 * possessive. Single-word spans are ignored — a scare-quoted term like "born
 * again" is a reference to the saying, not a claim to be reproducing it.
 */
export function extractQuotations(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/[“"]([^”"]{2,})[”"]/g)) {
    const quotation = match[1].trim();
    if (quotation.split(/\s+/).length > 1) found.push(quotation);
  }
  return found;
}
