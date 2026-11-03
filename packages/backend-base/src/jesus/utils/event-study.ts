/**
 * The event-level inductive study: one Precept study across every Gospel
 * account of a Jesus event.
 *
 * Why it exists: the app's studies are written per chapter, so a Jesus event
 * told by several Gospels could only ever be studied one chapter at a time.
 * Reported as "Cleansing of the temple study also only shows Matthew detail".
 * The mobile app merges the narrowed chapter studies side by side; this is the
 * layer that can do what a merge cannot — read the accounts together and say
 * how they relate.
 *
 * The model returns the study as JSON in the same shape as `@versemate/studies`
 * `InductiveStudy` (the shape every client already renders), minus the header
 * fields, which are filled from the event here. Before it is stored it must
 * pass the gates below. A record that fails is rejected and re-run, never
 * stored with a caveat — the same rule as every other generated layer.
 */
import {
  type ValidationIssue,
  extractQuotations,
  findOutOfScopeReferences,
  isQuotationGrounded,
} from "./generation-validation";

/** The Gospels — the only books an event study's references are scoped to. */
export const GOSPEL_BOOKS = ["Matthew", "Mark", "Luke", "John"] as const;

/**
 * The nine observation steps of the Precept method, by number, in the shape
 * the chapter studies use for each. Fixed so every client renders the event
 * study with the same step cards as a chapter study.
 */
export const EVENT_STUDY_STEP_KINDS: Record<number, string> = {
  1: "bullets",
  2: "qa",
  3: "keywords",
  4: "lists",
  5: "contrasts",
  6: "bullets",
  7: "bullets",
  8: "bullets",
  9: "segments",
};

const MIN_MOVEMENTS = 1;
const MIN_QUESTIONS = 3;

type Json = Record<string, unknown>;

export interface EventStudy {
  bookId: number;
  bookName: string;
  chapter: number;
  title: string;
  subtitle: string;
  themeOneLine: string;
  steps: Json[];
  interpretation: { intro?: string; movements: Json[] };
  application: { intro?: string; questions: Json[] };
}

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

/** Strip a code fence the model may have wrapped its JSON in. */
function unfence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

/** Every string anywhere in a JSON value, for the text-level gates. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (isObject(value))
    for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

/** What each step kind must carry for its card to render. */
function stepShapeIssues(step: Json, number: number): string[] {
  const problems: string[] = [];
  if (!isText(step.title)) problems.push(`step ${number}: missing title`);
  const kind = step.kind;
  const rows = (key: string, fields: string[]) => {
    const list = step[key];
    if (!Array.isArray(list) || list.length === 0) {
      problems.push(`step ${number}: "${key}" must be a non-empty array`);
      return;
    }
    list.forEach((row, i) => {
      if (!isObject(row)) {
        problems.push(`step ${number}: ${key}[${i}] is not an object`);
        return;
      }
      for (const field of fields) {
        if (!isText(row[field]) && typeof row[field] !== "number") {
          problems.push(`step ${number}: ${key}[${i}] missing "${field}"`);
        }
      }
    });
  };
  switch (kind) {
    case "bullets":
      rows("items", ["text"]);
      break;
    case "qa":
      rows("items", ["q", "a"]);
      break;
    case "keywords":
      rows("inventory", ["word", "verses"]);
      break;
    case "contrasts":
      rows("items", ["verses", "pairing"]);
      break;
    case "segments":
      rows("segments", ["title", "body"]);
      break;
    case "lists": {
      const lists = step.lists;
      if (!Array.isArray(lists) || lists.length === 0) {
        problems.push(`step ${number}: "lists" must be a non-empty array`);
        break;
      }
      lists.forEach((list, i) => {
        if (
          !isObject(list) ||
          !isText(list.title) ||
          !Array.isArray(list.rows)
        ) {
          problems.push(`step ${number}: lists[${i}] needs a title and rows`);
          return;
        }
        list.rows.forEach((row, j) => {
          if (!isObject(row) || !isText(row.ref) || !isText(row.truth)) {
            problems.push(
              `step ${number}: lists[${i}].rows[${j}] needs ref and truth`,
            );
          }
        });
      });
      break;
    }
    default:
      problems.push(`step ${number}: unknown kind "${String(kind)}"`);
  }
  return problems;
}

/**
 * Parse and gate a generated event study.
 *
 * @returns the normalised study when it passes, plus every issue found (an
 *   empty list means it may be stored).
 */
export function validateEventStudy(input: {
  content: string;
  /** The event's title — the study is "of" it. */
  eventTitle: string;
  /** `book|chapter` keys of the event's own passages. */
  allowedReferences: Iterable<string>;
  /** The verse text the model was given, concatenated. */
  sourceText: string;
  chapterCounts?: ReadonlyMap<string, number>;
}): { study: EventStudy | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfence(input.content));
  } catch (error) {
    return {
      study: null,
      issues: [
        {
          rule: "json",
          detail: `unparseable JSON: ${(error as Error).message}`,
        },
      ],
    };
  }
  if (!isObject(parsed)) {
    return {
      study: null,
      issues: [{ rule: "json", detail: "not a JSON object" }],
    };
  }

  // ── Shape ────────────────────────────────────────────────────────────────
  const steps = Array.isArray(parsed.steps)
    ? parsed.steps.filter(isObject)
    : [];
  for (const [n, kind] of Object.entries(EVENT_STUDY_STEP_KINDS)) {
    const number = Number(n);
    const step = steps.find((s) => s.number === number);
    if (!step) {
      issues.push({ rule: "shape", detail: `missing step ${number}` });
      continue;
    }
    if (step.kind !== kind) {
      issues.push({
        rule: "shape",
        detail: `step ${number} must be "${kind}", got "${String(step.kind)}"`,
      });
      continue;
    }
    for (const detail of stepShapeIssues(step, number))
      issues.push({ rule: "shape", detail });
  }

  const interpretation = isObject(parsed.interpretation)
    ? parsed.interpretation
    : {};
  const movements = Array.isArray(interpretation.movements)
    ? interpretation.movements.filter(isObject)
    : [];
  if (movements.length < MIN_MOVEMENTS) {
    issues.push({
      rule: "shape",
      detail: "interpretation needs at least one movement",
    });
  }
  movements.forEach((mv, i) => {
    if (!isText(mv.title) || !isText(mv.range) || !isText(mv.body)) {
      issues.push({
        rule: "shape",
        detail: `movement ${i + 1} needs title, range and body`,
      });
    }
  });

  const application = isObject(parsed.application) ? parsed.application : {};
  const questions = Array.isArray(application.questions)
    ? application.questions.filter(isObject)
    : [];
  if (questions.length < MIN_QUESTIONS) {
    issues.push({
      rule: "shape",
      detail: `application needs at least ${MIN_QUESTIONS} questions`,
    });
  }
  questions.forEach((q, i) => {
    if (!isText(q.question) || !isText(q.range)) {
      issues.push({
        rule: "shape",
        detail: `question ${i + 1} needs question and range`,
      });
    }
  });

  // ── Text gates ───────────────────────────────────────────────────────────
  const text = allStrings(parsed).join("\n");

  // Gospel references must stay inside the event's own accounts. Other
  // scripture (Isaiah 56:7 behind the temple cleansing) is cited freely, as
  // the chapter studies do — so only the four Gospels are scope-checked.
  const stray = findOutOfScopeReferences(
    text,
    [...GOSPEL_BOOKS],
    input.allowedReferences,
    input.chapterCounts,
  );
  if (stray.length > 0) {
    const unique = [...new Set(stray.map((r) => `${r.book} ${r.chapter}`))];
    issues.push({
      rule: "reference-scope",
      detail: `Gospel references outside the event: ${unique.join(", ")}`,
    });
  }

  // Anything in quotation marks must be in the passages the model was given.
  for (const quotation of extractQuotations(text)) {
    if (!isQuotationGrounded(quotation, input.sourceText)) {
      issues.push({
        rule: "quotation-grounded",
        detail: `quotation not in the event's passages: "${quotation.slice(0, 60)}"`,
      });
    }
  }

  if (issues.length > 0) return { study: null, issues };

  return {
    study: {
      bookId: 0,
      bookName: "",
      chapter: 0,
      title: input.eventTitle,
      subtitle: "The Precept Method, Across the Gospels",
      themeOneLine: isText(parsed.themeOneLine) ? parsed.themeOneLine : "",
      steps: [...steps].sort((a, b) => Number(a.number) - Number(b.number)),
      interpretation: {
        intro: isText(interpretation.intro) ? interpretation.intro : undefined,
        movements: movements.map((mv, i) => ({ ...mv, number: i + 1 })),
      },
      application: {
        intro: isText(application.intro) ? application.intro : undefined,
        questions,
      },
    },
    issues: [],
  };
}

/** How many different Gospels tell an event — a study needs at least two. */
export function distinctGospels(
  passages: Array<{ book_name: string }>,
): number {
  return new Set(
    passages
      .map((p) => p.book_name)
      .filter((b) => (GOSPEL_BOOKS as readonly string[]).includes(b)),
  ).size;
}
