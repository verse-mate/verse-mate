import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { coldRecallInFeedback } from "./coach-governance.service";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";
import {
  FIRST_LESSON_RATIONALE,
  MEMORY_REINFORCEMENT,
  composeBaseScore,
  composeComposite,
  statusForScore,
} from "./rubric";

export type CorrectionRefusal =
  | "legacy-report"
  | "unknown-report"
  | "unknown-dimension"
  | "already-delivered"
  | "partially-delivered"
  | "in-flight"
  | "score-out-of-range"
  | "memory-reinforcement-required";

export interface CorrectionResult {
  ok: boolean;
  refusal?: CorrectionRefusal;
  base?: number;
  score?: number;
  status?: { label: string; emoji: string };
}

export interface ReviewState {
  reportId: string;
  delivered: boolean;
  dimensions: Array<{
    n: number;
    score: number | null;
    rationale: string;
    provenance: string;
    modelVersion: string | null;
  }>;
  base: number;
  /** True when any dimension was corrected by a human. */
  humanCorrected: boolean;
  firstLesson: boolean;
  firstLessonSource: string | null;
  passageBook: string | null;
  parallelRun: boolean;
}

export interface FirstLessonResult extends CorrectionResult {
  firstLesson?: boolean;
}

export interface ImprovementsEditResult {
  ok: boolean;
  refusal?:
    | "legacy-report"
    | "unknown-report"
    | "already-delivered"
    | "partially-delivered"
    | "in-flight"
    | "empty-edit"
    | "cold-recall-improvement";
  coldRecall?: string[];
}

export class CoachReviewService {
  constructor(private readonly db: db) {}

  private async session(reportId: string) {
    return this.db
      .getOrCreateConnection()
      .selectFrom("coach_intake_sessions")
      .select(["state", "parallel_run"])
      .where("report_id", "=", reportId)
      .executeTakeFirst();
  }

  /** What an admin sees: every dimension with where its number came from. */
  async review(reportId: string): Promise<ReviewState | null> {
    const conn = this.db.getOrCreateConnection();
    const rows = await conn
      .selectFrom("coach_report_dimension_scores")
      .select([
        "dimension_n",
        "score",
        "rationale",
        "provenance",
        "model_version",
      ])
      .where("report_id", "=", reportId)
      .orderBy("dimension_n")
      .execute();
    if (rows.length === 0) return null;

    const scores = new Map(rows.map((r) => [r.dimension_n, r.score]));
    const report = await conn
      .selectFrom("coach_reports")
      .select(["first_lesson", "first_lesson_source", "passage_book"])
      .where("id", "=", reportId)
      .executeTakeFirst();
    const session = await this.session(reportId);
    return {
      reportId,
      delivered: session?.state === "delivered",
      dimensions: rows.map((r) => ({
        n: r.dimension_n,
        score: r.score,
        rationale: r.rationale,
        provenance: r.provenance,
        modelVersion: r.model_version,
      })),
      base: composeBaseScore(scores).base,
      humanCorrected: rows.some((r) => r.provenance === "human"),
      firstLesson: report?.first_lesson ?? false,
      firstLessonSource: report?.first_lesson_source ?? null,
      passageBook: report?.passage_book ?? null,
      parallelRun: session?.parallel_run ?? false,
    };
  }

  async setFirstLesson(input: {
    reportId: string;
    firstLesson: boolean;
    score?: number | null;
    rationale?: string;
    byUserId: string | null;
  }): Promise<FirstLessonResult> {
    const rationale = input.rationale?.trim() ?? "";
    if (!input.firstLesson && (input.score == null || rationale.length === 0)) {
      return { ok: false, refusal: "memory-reinforcement-required" };
    }
    if (input.score != null && (input.score < 1 || input.score > 5)) {
      return { ok: false, refusal: "score-out-of-range" };
    }
    if (await isLegacyReport(this.db, input.reportId)) {
      return { ok: false, refusal: "legacy-report" };
    }

    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx): Promise<FirstLessonResult> => {
        const locked = await lockForCorrection(trx, input.reportId);
        if (locked) return { ok: false, refusal: locked };
        const updated = await trx
          .updateTable("coach_report_dimension_scores")
          .set({
            score: input.firstLesson ? null : input.score ?? null,
            rationale: input.firstLesson
              ? rationale || FIRST_LESSON_RATIONALE
              : rationale,
            provenance: "human",
            corrected_by: input.byUserId,
            updated_at: sql`NOW()`,
          })
          .where("report_id", "=", input.reportId)
          .where("dimension_n", "=", MEMORY_REINFORCEMENT)
          .executeTakeFirst();
        if (Number(updated.numUpdatedRows ?? 0) === 0) {
          return { ok: false, refusal: "unknown-report" as const };
        }
        await trx
          .updateTable("coach_reports")
          .set({
            first_lesson: input.firstLesson,
            first_lesson_source: "admin",
            evidence: null,
          })
          .where("id", "=", input.reportId)
          .execute();
        return {
          ok: true,
          firstLesson: input.firstLesson,
          ...(await rescoreReport(trx, input.reportId)),
        };
      });
  }

  async editImprovements(input: {
    reportId: string;
    improvements: string[];
    improvementsProse?: Array<{ title: string; paragraphs: string[] }>;
    byUserId: string | null;
  }): Promise<ImprovementsEditResult> {
    if (await isLegacyReport(this.db, input.reportId)) {
      return { ok: false, refusal: "legacy-report" };
    }
    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx): Promise<ImprovementsEditResult> => {
        const locked = await lockForCorrection(trx, input.reportId);
        if (locked) return { ok: false, refusal: locked };
        if (input.improvements.length === 0)
          return { ok: false, refusal: "empty-edit" };
        const report = await trx
          .selectFrom("coach_reports")
          .select(["body", "first_lesson"])
          .where("id", "=", input.reportId)
          .executeTakeFirst();
        if (!report) return { ok: false, refusal: "unknown-report" };
        const body = (report.body ?? {}) as Record<string, unknown>;
        const previous = (body.feedback ?? {}) as Record<string, unknown>;
        const listOrNull = (v: unknown) =>
          JSON.stringify(Array.isArray(v) && v.length > 0 ? v : null);
        if (
          listOrNull(previous.improvements) ===
            listOrNull(input.improvements) &&
          listOrNull(previous.improvementsProse) ===
            listOrNull(input.improvementsProse)
        )
          return { ok: false, refusal: "empty-edit" };
        const { improvementsProse: _cleared, ...kept } = previous;
        const feedback: Record<string, unknown> = {
          ...kept,
          improvements: input.improvements,
          ...(input.improvementsProse
            ? { improvementsProse: input.improvementsProse }
            : {}),
        };
        if (report.first_lesson) {
          const coldRecall = coldRecallInFeedback(feedback);
          if (coldRecall.length > 0)
            return {
              ok: false,
              refusal: "cold-recall-improvement",
              coldRecall,
            };
        }
        await trx
          .insertInto("coach_report_edits")
          .values({
            report_id: input.reportId,
            changes: JSON.stringify({
              improvements: {
                from: previous.improvements ?? null,
                to: input.improvements,
              },
              improvementsProse: {
                from: previous.improvementsProse ?? null,
                to: input.improvementsProse ?? null,
              },
            }),
            edited_by: input.byUserId,
          })
          .execute();
        await trx
          .updateTable("coach_reports")
          .set({
            body: JSON.stringify({ ...body, feedback }),
            updated_at: sql`NOW()`,
          })
          .where("id", "=", input.reportId)
          .execute();
        return { ok: true };
      });
  }

  async correct(input: {
    reportId: string;
    dimensionN: number;
    score: number | null;
    rationale: string;
    correctedByUserId: string | null;
  }): Promise<CorrectionResult> {
    const conn = this.db.getOrCreateConnection();

    if (input.score !== null && (input.score < 1 || input.score > 5)) {
      return { ok: false, refusal: "score-out-of-range" };
    }
    if (await isLegacyReport(this.db, input.reportId)) {
      return { ok: false, refusal: "legacy-report" };
    }

    return conn
      .transaction()
      .execute(async (trx): Promise<CorrectionResult> => {
        const locked = await lockForCorrection(trx, input.reportId);
        if (locked) return { ok: false, refusal: locked };
        const existing = await trx
          .selectFrom("coach_report_dimension_scores")
          .select("dimension_n")
          .where("report_id", "=", input.reportId)
          .executeTakeFirst();
        if (!existing) return { ok: false, refusal: "unknown-report" as const };

        const updated = await trx
          .updateTable("coach_report_dimension_scores")
          .set({
            score: input.score,
            rationale: input.rationale,
            provenance: "human",
            corrected_by: input.correctedByUserId,
            updated_at: sql`NOW()`,
          })
          .where("report_id", "=", input.reportId)
          .where("dimension_n", "=", input.dimensionN)
          .executeTakeFirst();
        if (Number(updated.numUpdatedRows ?? 0) === 0) {
          return { ok: false, refusal: "unknown-dimension" as const };
        }
        await trx
          .updateTable("coach_reports")
          .set({ evidence: null })
          .where("id", "=", input.reportId)
          .execute();

        return { ok: true, ...(await rescoreReport(trx, input.reportId)) };
      });
  }
}

const CORRECTABLE_STATES = ["scored", "delivery_pending", "delivery_failed"];

async function lockForCorrection(
  trx: CoachReportsWriter,
  reportId: string,
): Promise<
  | "unknown-report"
  | "already-delivered"
  | "partially-delivered"
  | "in-flight"
  | null
> {
  const session = await trx
    .selectFrom("coach_intake_sessions")
    .select(["state", "delivered_to", "published"])
    .where("report_id", "=", reportId)
    .forUpdate()
    .executeTakeFirst();
  if (!session) return "unknown-report";
  if (session.state === "delivered") return "already-delivered";
  if (session.published || session.delivered_to.length > 0)
    return "partially-delivered";
  return CORRECTABLE_STATES.includes(session.state) ? null : "in-flight";
}

export async function isLegacyReport(
  database: db,
  reportId: string,
): Promise<boolean> {
  const row = await database
    .getOrCreateConnection()
    .selectFrom("coach_reports")
    .select("source_session_id")
    .where("id", "=", reportId)
    .executeTakeFirst();
  return row?.source_session_id.startsWith("legacy:") ?? false;
}

export async function rescoreReport(
  trx: CoachReportsWriter,
  reportId: string,
): Promise<{
  base: number;
  score: number;
  status: { label: string; emoji: string };
}> {
  const dimensions = await trx
    .selectFrom("coach_report_dimension_scores")
    .select(["dimension_n", "score", "rationale"])
    .where("report_id", "=", reportId)
    .execute();
  const report = await trx
    .selectFrom("coach_reports")
    .select(["summary", "metrics"])
    .where("id", "=", reportId)
    .executeTakeFirstOrThrow();
  const summary = (report.summary ?? {}) as Record<string, unknown>;
  const metrics = (report.metrics ?? {}) as Record<string, unknown>;

  const byN = new Map(dimensions.map((d) => [d.dimension_n, d]));
  const { base, clusters } = composeBaseScore(
    new Map(dimensions.map((d) => [d.dimension_n, d.score])),
  );
  const score = composeComposite(base, {
    newcomerBonus: Number(metrics.newcomerBonus ?? 0),
    sizeBonus: Number(metrics.sizeBonus ?? 0),
  });
  const status = statusForScore(score);
  const stored = Array.isArray(metrics.dimensions)
    ? (metrics.dimensions as Array<Record<string, unknown>>)
    : [];

  await trx
    .updateTable("coach_reports")
    .set({
      metrics: JSON.stringify({
        ...metrics,
        base,
        clusters,
        dimensions: stored.map((d) => {
          const row = byN.get(Number(d.n));
          return row ? { ...d, score: row.score, note: row.rationale } : d;
        }),
      }),
      summary: JSON.stringify({
        ...summary,
        score,
        status: status.label,
        statusEmoji: status.emoji,
      }),
      updated_at: sql`NOW()`,
    })
    .where("id", "=", reportId)
    .execute();

  return { base, score, status: { label: status.label, emoji: status.emoji } };
}
