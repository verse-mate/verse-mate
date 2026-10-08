import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";

/**
 * The two MECHANICAL governance rules (change: port-coach-pipeline, task 6.2).
 *
 * Exactly two, and this module claims nothing beyond them. The QA checklist has
 * many more rules; every other one stays human-checked, and pretending
 * otherwise would be worse than not checking at all, a checklist people
 * believe is automated stops being read.
 *
 * Rule 1: the benchmark leader's name must not appear in ANOTHER leader's
 *         report body. His own reports are exempt, because comparison to his
 *         own history is the point of them.
 * Rule 2: a leader must not reuse a quote or a timestamp across two of their
 *         own reports.
 */

export interface ReportEvidence {
  /** Verbatim quotes the report cites. */
  quotes: string[];
  /** Structured session timestamps the report cites. */
  timestamps: string[];
}

export type GovernanceViolation =
  | { rule: "benchmark-name"; detail: string }
  | { rule: "reused-quote"; detail: string }
  | { rule: "reused-timestamp"; detail: string };

export interface GovernanceVerdict {
  passed: boolean;
  violations: GovernanceViolation[];
}

/**
 * Quotes match as exact strings after whitespace and case normalization.
 *
 * A STATED LIMIT: verbatim reuse only. A quote re-punctuated or trimmed by a
 * word is not detected, and pretending to catch that would need a similarity
 * threshold nobody has calibrated, a threshold that blocks a leader's report
 * on a judgement call is worse than a narrow rule that never surprises them.
 */
export function normalizeQuote(quote: string): string {
  return quote.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Rule 1, as a pure check.
 *
 * There is NO attendee-list exception. Open question 4 is answered, attendance
 * is a count, never names, so there is no appendix for a name to sit in, and
 * the rule is unconditional outside his own reports.
 */
export function checkBenchmarkName(input: {
  reportCoachId: string;
  benchmarkCoachId: string | null;
  benchmarkName: string | null;
  body: string;
}): GovernanceViolation[] {
  if (!input.benchmarkCoachId || !input.benchmarkName) return [];
  // His own report: comparison to his own history is required, so his name
  // appearing there is correct, not a leak.
  if (input.reportCoachId === input.benchmarkCoachId) return [];
  const name = input.benchmarkName.trim();
  if (name.length === 0) return [];
  if (!input.body.toLowerCase().includes(name.toLowerCase())) return [];
  return [
    {
      rule: "benchmark-name",
      detail: `the benchmark leader's name appears in ${input.reportCoachId}'s report body`,
    },
  ];
}

export function checkEvidenceReuse(
  candidate: ReportEvidence,
  earlier: Array<ReportEvidence & { reportId?: string }>,
): GovernanceViolation[] {
  const seenQuotes = new Map<string, string | undefined>();
  const seenTimestamps = new Map<string, string | undefined>();
  for (const e of earlier) {
    for (const q of e.quotes)
      if (!seenQuotes.has(normalizeQuote(q)))
        seenQuotes.set(normalizeQuote(q), e.reportId);
    for (const t of e.timestamps)
      if (!seenTimestamps.has(t)) seenTimestamps.set(t, e.reportId);
  }
  const named = (reportId: string | undefined) =>
    reportId ? `earlier report ${reportId}` : "an earlier report";

  const violations: GovernanceViolation[] = [];
  for (const quote of candidate.quotes) {
    const key = normalizeQuote(quote);
    if (seenQuotes.has(key)) {
      violations.push({
        rule: "reused-quote",
        detail: `a quote already used in ${named(seenQuotes.get(key))}: "${quote.slice(0, 60)}"`,
      });
    }
  }
  for (const stamp of candidate.timestamps) {
    if (seenTimestamps.has(stamp)) {
      violations.push({
        rule: "reused-timestamp",
        detail: `timestamp ${stamp} already cited in ${named(seenTimestamps.get(stamp))}`,
      });
    }
  }
  return violations;
}

const RECALL = /\b(recall|review|recap|recite|recitation)\b/i;
const PRIOR =
  /\b(big ideas?|prior|previous|last (week|session|lesson)'?s?|earlier lessons?)\b/i;

function itemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object")
    return Object.values(item as Record<string, unknown>)
      .map(itemText)
      .join(" ");
  return "";
}

export function coldRecallImprovements(improvements: unknown): string[] {
  if (!Array.isArray(improvements)) return [];
  return improvements.map(itemText).filter((text) => {
    if (/\bcold[- ]recall\b/i.test(text)) return true;
    return RECALL.test(text) && PRIOR.test(text);
  });
}

export function coldRecallInFeedback(feedback: unknown): string[] {
  const f = (feedback ?? {}) as Record<string, unknown>;
  return [
    ...coldRecallImprovements(f.improvements),
    ...coldRecallImprovements(f.improvementsProse),
  ];
}

export function evidenceFrom(
  dimensions: Array<{ note: string }>,
): ReportEvidence {
  const quotes: string[] = [];
  const timestamps: string[] = [];
  for (const d of dimensions) {
    for (const quoted of d.note.matchAll(
      /[""]([^""]{12,})[""]|"([^"]{12,})"/g,
    )) {
      const text = quoted[1] ?? quoted[2];
      if (text) quotes.push(text.trim());
    }
    for (const stamp of d.note.matchAll(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g)) {
      timestamps.push(stamp[0]);
    }
  }
  return {
    quotes: [...new Set(quotes)],
    timestamps: [...new Set(timestamps)],
  };
}

export class CoachGovernanceService {
  constructor(private readonly db: Pick<db, "getOrCreateConnection">) {}

  /**
   * Check a report at DELIVERY time, against what is already persisted.
   *
   * Delivery time, not scoring time, because "earlier" has to mean "already
   * delivered", and per-leader delivery is serialized by the caller so that
   * two reports produced in one poll cycle still have an order. Without that,
   * two same-cycle reports could each see the other as not-yet-existing and
   * both ship with the same quote.
   */
  async check(input: {
    reportId: string;
    coachId: string;
    body: string;
    evidence: ReportEvidence;
  }): Promise<GovernanceVerdict> {
    const conn = this.db.getOrCreateConnection();

    const benchmark = await conn
      .selectFrom("coach_leaders")
      .select(["slug", "name"])
      .where("is_benchmark", "=", true)
      .executeTakeFirst();

    const violations = checkBenchmarkName({
      reportCoachId: input.coachId,
      benchmarkCoachId: benchmark?.slug ?? null,
      benchmarkName: benchmark?.name ?? null,
      body: input.body,
    });

    const earlierRows = await conn
      .selectFrom("coach_reports")
      .select(["id", "evidence"])
      .where("coach_id", "=", input.coachId)
      .where("id", "!=", input.reportId)
      .where("evidence", "is not", null)
      .orderBy("session_date")
      .orderBy("id")
      .execute();
    const earlier = earlierRows.map((r) => ({
      ...normalizeEvidence(r.evidence),
      reportId: r.id,
    }));

    violations.push(...checkEvidenceReuse(input.evidence, earlier));
    return { passed: violations.length === 0, violations };
  }

  /** Persist a report's evidence, which is what makes it part of the set. */
  async recordEvidence(
    reportId: string,
    evidence: ReportEvidence,
  ): Promise<void> {
    await sql`
      UPDATE coach_reports
      SET evidence = ${JSON.stringify(evidence)}::jsonb, updated_at = NOW()
      WHERE id = ${reportId}
    `.execute(this.db.getOrCreateConnection());
  }
}

function normalizeEvidence(raw: unknown): ReportEvidence {
  const value = (raw ?? {}) as Partial<ReportEvidence>;
  return {
    quotes: Array.isArray(value.quotes) ? value.quotes : [],
    timestamps: Array.isArray(value.timestamps) ? value.timestamps : [],
  };
}

export async function storedEvidence(
  database: Pick<db, "getOrCreateConnection">,
  reportId: string,
): Promise<ReportEvidence> {
  const cited = await database
    .getOrCreateConnection()
    .selectFrom("coach_report_dimension_scores")
    .select("rationale")
    .where("report_id", "=", reportId)
    .execute();
  return evidenceFrom(cited.map((c) => ({ note: c.rationale })));
}
