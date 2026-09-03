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

/** Rule 2, as a pure check against a leader's already-delivered evidence. */
export function checkEvidenceReuse(
  candidate: ReportEvidence,
  earlier: ReportEvidence[],
): GovernanceViolation[] {
  const seenQuotes = new Set(
    earlier.flatMap((e) => e.quotes.map(normalizeQuote)),
  );
  // Timestamps compare as EXACT stored values, not overlapping ranges. Range
  // overlap would flag two genuinely different moments in the same minute.
  const seenTimestamps = new Set(earlier.flatMap((e) => e.timestamps));

  const violations: GovernanceViolation[] = [];
  for (const quote of candidate.quotes) {
    if (seenQuotes.has(normalizeQuote(quote))) {
      violations.push({
        rule: "reused-quote",
        detail: `a quote already used in an earlier report: "${quote.slice(0, 60)}"`,
      });
    }
  }
  for (const stamp of candidate.timestamps) {
    if (seenTimestamps.has(stamp)) {
      violations.push({
        rule: "reused-timestamp",
        detail: `timestamp ${stamp} already cited in an earlier report`,
      });
    }
  }
  return violations;
}

export class CoachGovernanceService {
  constructor(private readonly db: db) {}

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

    // Only this leader's reports, and only those carrying structured evidence.
    // A NULL evidence column means the report predates the field, every
    // backfilled report, and the comparison set starts empty at cutover
    // rather than being seeded unevenly from whatever happens to exist.
    const earlierRows = await conn
      .selectFrom("coach_reports")
      .select("evidence")
      .where("coach_id", "=", input.coachId)
      .where("id", "!=", input.reportId)
      .where("evidence", "is not", null)
      .execute();
    const earlier = earlierRows.map((r) => normalizeEvidence(r.evidence));

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
