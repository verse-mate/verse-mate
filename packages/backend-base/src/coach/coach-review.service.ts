import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";
import { composeBaseScore, composeComposite, statusForScore } from "./rubric";

export type CorrectionRefusal =
  | "legacy-report"
  | "unknown-report"
  | "unknown-dimension"
  | "already-delivered"
  | "score-out-of-range";

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
}

export class CoachReviewService {
  constructor(private readonly db: db) {}

  private async isDelivered(reportId: string): Promise<boolean> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("report_id", "=", reportId)
      .executeTakeFirst();
    return row?.state === "delivered";
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
    return {
      reportId,
      delivered: await this.isDelivered(reportId),
      dimensions: rows.map((r) => ({
        n: r.dimension_n,
        score: r.score,
        rationale: r.rationale,
        provenance: r.provenance,
        modelVersion: r.model_version,
      })),
      base: composeBaseScore(scores).base,
      humanCorrected: rows.some((r) => r.provenance === "human"),
    };
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
    if (await this.isDelivered(input.reportId)) {
      return { ok: false, refusal: "already-delivered" };
    }

    return conn.transaction().execute(async (trx) => {
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

      return { ok: true, ...(await rescoreReport(trx, input.reportId)) };
    });
  }
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

async function rescoreReport(
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
