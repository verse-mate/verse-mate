import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { composeBaseScore, statusForScore } from "./rubric";

/**
 * The admin review path (change: port-coach-pipeline, task 5.7).
 *
 * A machine score is a starting point, not a verdict. An admin can correct one
 * dimension of an UNDELIVERED report; the composite is recomputed from the
 * corrected set, and that dimension is marked human-corrected so the change is
 * visible rather than folded invisibly into a number.
 *
 * Correction is refused once a report has been delivered. A leader has already
 * read the score by then, and quietly changing it afterwards means two people
 * discussing different reports with the same id. Re-scoring after delivery is a
 * different act and needs its own decision.
 *
 * A report nobody corrects is delivered as machine-scored. Review is not a
 * required step — making it one would put a human back in the loop the port
 * exists to remove.
 */

export type CorrectionRefusal =
  | "unknown-report"
  | "unknown-dimension"
  | "already-delivered"
  | "score-out-of-range";

export interface CorrectionResult {
  ok: boolean;
  refusal?: CorrectionRefusal;
  /** Recomputed from the corrected set, not patched. */
  base?: number;
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
    if (await this.isDelivered(input.reportId)) {
      return { ok: false, refusal: "already-delivered" };
    }

    const existing = await conn
      .selectFrom("coach_report_dimension_scores")
      .select("dimension_n")
      .where("report_id", "=", input.reportId)
      .executeTakeFirst();
    if (!existing) return { ok: false, refusal: "unknown-report" };

    const updated = await conn
      .updateTable("coach_report_dimension_scores")
      .set({
        score: input.score,
        rationale: input.rationale,
        // Marked here, and this is what makes a later re-score leave it alone
        // (task 5.6's WHERE provenance = 'machine').
        provenance: "human",
        corrected_by: input.correctedByUserId,
        updated_at: sql`NOW()`,
      })
      .where("report_id", "=", input.reportId)
      .where("dimension_n", "=", input.dimensionN)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      return { ok: false, refusal: "unknown-dimension" };
    }

    // Recomputed from the corrected set rather than adjusted by a delta, so
    // the composite always equals what its dimensions say.
    const after = await this.review(input.reportId);
    const base = after?.base ?? 0;
    return { ok: true, base, status: statusForScore(base) };
  }
}
