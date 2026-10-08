import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { CoachArchiveService } from "./coach-archive.service";
import { coachPipelineLive } from "./coach-cutover";
import {
  CoachDeliveryService,
  type DeliveryResult,
  STALE_DELIVERY_CLAIM,
} from "./coach-delivery.service";
import { applyFirstLessonDetection } from "./coach-first-lesson";
import { CoachFrameService } from "./coach-frames.service";
import type { ReportEvidence } from "./coach-governance.service";
import {
  AttributionChangedError,
  CoachPublishService,
} from "./coach-publish.service";
import {
  AUTHENTICITY_DIMENSION,
  CoachScoringService,
  authenticityBaseline,
} from "./coach-scoring.service";
import type { CoachMailer } from "./coach.service";
import type { FirefliesDetailClient } from "./fireflies.client";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";

/**
 * The pipeline, connected (change: port-coach-pipeline).
 *
 * Each stage was built and tested on its own and then never joined up: the
 * worker ran intake and retrieval and stopped, so scoring, publishing,
 * delivery, frame extraction, coverage, retention and the calibration harness
 * were all unreachable code. Recordings were retrieved, stored and paid for,
 * and no report was ever produced from them.
 *
 * The join was not a missing call. `coach_report_dimension_scores.report_id` is
 * a NOT NULL foreign key to `coach_reports.id`, so scoring could not persist
 * before a report row existed, and publishing needs the composite that scoring
 * produces. Scoring now computes without writing, publishing creates the row,
 * and the dimensions are persisted into it. That order is the whole reason this
 * class exists.
 */

/** Stages a session passes through, in order. */
export type PipelineOutcome =
  | "scored-and-delivered"
  | "scored-awaiting-review"
  | "scoring-failed"
  | "delivery-blocked"
  | "delivery-failed"
  | "attribution-changed";

export interface PipelineResult {
  sourceSessionId: string;
  outcome: PipelineOutcome;
  reportId?: string;
  detail?: string;
}

/** How many retained sessions one tick carries through to a report. */
export const PIPELINE_BATCH_LIMIT = 5;

export const PIPELINE_ATTEMPT_LIMIT = 5;

const PARALLEL_RUN_HOLD =
  "parallel run: kept for admin comparison, nothing is sent until cutover";

const NO_MAILER_HOLD = "held until delivered: no mailer is configured";

export const REATTRIBUTED_HOLD =
  "re-attributed: held until an admin releases it";

export class CoachPipelineService {
  private readonly scoring: CoachScoringService;
  private readonly frames: CoachFrameService;
  private readonly publish: CoachPublishService;
  private readonly delivery: CoachDeliveryService | null;

  constructor(
    private readonly db: db,
    private readonly fireflies: FirefliesDetailClient,
    mailer: CoachMailer | null,
    deps: {
      scoring?: CoachScoringService;
      frames?: CoachFrameService;
      publish?: CoachPublishService;
      delivery?: CoachDeliveryService;
    } = {},
  ) {
    this.scoring = deps.scoring ?? new CoachScoringService(db);
    this.frames = deps.frames ?? new CoachFrameService();
    this.publish = deps.publish ?? new CoachPublishService(db);
    this.delivery =
      deps.delivery ?? (mailer ? new CoachDeliveryService(db, mailer) : null);
  }

  /** Carry every session whose material is retained through to a report. */
  async run(): Promise<PipelineResult[]> {
    const due = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_intake_sessions")
      .select([
        "source_session_id",
        "coach_id",
        "title",
        "retry_count",
        "release_required",
      ])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where("state", "=", "retained")
      .where("coach_id", "is not", null)
      .orderBy("retry_count")
      .orderBy("observed_at")
      // Bounded: each session is a model call plus a frame extraction, so an
      // unbounded tick could spend an unbounded amount of money.
      .limit(PIPELINE_BATCH_LIMIT)
      .execute();

    const out: PipelineResult[] = await this.redeliver();
    for (const session of due) {
      let result: PipelineResult;
      try {
        result = await this.runOne(session);
      } catch (error) {
        console.error(
          `[COACH-PIPELINE] ${session.source_session_id} threw:`,
          error,
        );
        result = {
          sourceSessionId: session.source_session_id,
          outcome: "scoring-failed",
          detail: error instanceof Error ? error.message : String(error),
        };
      }
      if (result.outcome === "scoring-failed") {
        await this.countScoringFailure(
          session.source_session_id,
          session.retry_count,
        );
        await this.queueForRedelivery(session.source_session_id);
      }
      out.push(result);
    }
    return out;
  }

  private async redeliver(): Promise<PipelineResult[]> {
    const delivery = this.delivery;
    if (!delivery) return [];
    const conn = this.db.getOrCreateConnection();
    const pending = await conn
      .selectFrom("coach_intake_sessions")
      .select(["source_session_id", "report_id"])
      .where((eb) =>
        eb.or([
          eb("state", "=", "delivery_pending"),
          eb.and([
            eb("state", "=", "delivering"),
            eb("updated_at", "<", STALE_DELIVERY_CLAIM),
          ]),
        ]),
      )
      .where("report_id", "is not", null)
      .orderBy(sql`hold_reason IS NOT NULL`)
      .orderBy("retry_count")
      .orderBy("updated_at")
      .limit(PIPELINE_BATCH_LIMIT)
      .execute();

    const out: PipelineResult[] = [];
    for (const session of pending) {
      const reportId = session.report_id as string;
      const result = await delivery.deliver({
        reportId,
        evidence: await storedEvidence(this.db, reportId),
      });
      out.push(deliveryOutcome(session.source_session_id, reportId, result));
    }
    return out;
  }

  private async authenticityBaselineFor(
    coachId: string,
    sessionDate: string,
    sourceSessionId: string,
  ): Promise<number | null> {
    const prior = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .leftJoin("coach_report_dimension_scores as corrected", (join) =>
        join
          .onRef("corrected.report_id", "=", "coach_reports.id")
          .on("corrected.dimension_n", "=", AUTHENTICITY_DIMENSION),
      )
      .select([
        "corrected.report_id as correctedReport",
        "corrected.score as correctedScore",
        sql<string | null>`(
          SELECT d->>'score' FROM jsonb_array_elements(coach_reports.metrics->'dimensions') d
          WHERE (d->>'n')::int = ${AUTHENTICITY_DIMENSION}
          LIMIT 1
        )`.as("storedScore"),
      ])
      .where("coach_reports.coach_id", "=", coachId)
      .where("coach_reports.session_date", "<", sql<Date>`${sessionDate}::date`)
      .where("coach_reports.source_session_id", "!=", sourceSessionId)
      .orderBy("coach_reports.session_date", "desc")
      .execute();
    return authenticityBaseline(
      prior.map((p) => {
        const value = p.correctedReport ? p.correctedScore : p.storedScore;
        const n =
          value === null || value === undefined ? Number.NaN : Number(value);
        return Number.isFinite(n) ? n : null;
      }),
    );
  }

  private async queueForRedelivery(sourceSessionId: string): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .updateTable("coach_intake_sessions")
      .set({ state: "delivery_pending", updated_at: sql`NOW()` })
      .where("source_session_id", "=", sourceSessionId)
      .where("report_id", "is not", null)
      .where((eb) =>
        eb.or([
          eb("state", "=", "delivering"),
          eb.and([eb("state", "=", "scored"), eb("hold_reason", "is", null)]),
        ]),
      )
      .execute();
  }

  private async countScoringFailure(
    sourceSessionId: string,
    retryCount: number,
  ): Promise<void> {
    const attempts = retryCount + 1;
    await this.db
      .getOrCreateConnection()
      .updateTable("coach_intake_sessions")
      .set({
        retry_count: attempts,
        state:
          attempts >= PIPELINE_ATTEMPT_LIMIT ? "scoring_failed" : "retained",
        updated_at: sql`NOW()`,
      })
      .where("source_session_id", "=", sourceSessionId)
      .where("state", "=", "retained")
      .execute();
  }

  private async runOne(session: {
    source_session_id: string;
    coach_id: string | null;
    title: string;
    date: string;
    release_required: boolean;
  }): Promise<PipelineResult> {
    const conn = this.db.getOrCreateConnection();
    const coachId = session.coach_id as string;

    const leader = await conn
      .selectFrom("coach_leaders")
      .select("name")
      .where("slug", "=", coachId)
      .executeTakeFirst();

    const detail = await this.fireflies.getTranscript(
      session.source_session_id,
      leader?.name ?? null,
    );
    if (!detail) {
      return {
        sourceSessionId: session.source_session_id,
        outcome: "scoring-failed",
        detail: "the provider no longer returns this session",
      };
    }

    // Visual Aids is the one dimension the transcript cannot answer, so the
    // frames come from the recording WE retained, not from the provider.
    const recordingKey = CoachArchiveService.recordingKey(
      session.source_session_id,
    );
    const frames = await this.frames
      .extract(recordingKey)
      .then((f) => f.map((x) => x.data))
      .catch(() => [] as Uint8Array[]);

    const scored = await this.scoring.scoreSession({
      transcript: detail.sentences,
      sessionTitle: session.title,
      frames,
      authenticityBaseline: await this.authenticityBaselineFor(
        coachId,
        session.date,
        session.source_session_id,
      ),
    });
    if (!scored.ok || !scored.dimensions) {
      return {
        sourceSessionId: session.source_session_id,
        outcome: "scoring-failed",
        detail: `${scored.failure}: ${scored.detail ?? ""}`.trim(),
      };
    }

    const dimensions = scored.dimensions;
    const holdReason =
      scored.reviewReason ??
      (session.release_required ? REATTRIBUTED_HOLD : null);
    const published = await this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        const report = await this.publish.publish(
          {
            sourceSessionId: session.source_session_id,
            coachId,
            sessionDate: session.date,
            sessionTitle: session.title,
            base: scored.base ?? 0,
            clusters: scored.clusters ?? [],
            dimensions,
            bigIdeas: [],
            feedback: {
              headline: "",
              strengths: [],
              improvements: [],
              recommendations: [],
            },
            attendees: detail.participantCount,
            newcomers: scored.newcomers ?? 0,
            duration: `${detail.duration ?? 0} min`,
            holdReason,
          },
          trx as CoachReportsWriter,
        );
        await this.scoring.persistDimensions(
          report.reportId,
          dimensions,
          trx as CoachReportsWriter,
        );
        await applyFirstLessonDetection(
          trx as CoachReportsWriter,
          report.reportId,
          scored.passageBook,
        );
        return report;
      })
      .catch((error: unknown) => {
        if (error instanceof AttributionChangedError) return error;
        throw error;
      });
    if (published instanceof AttributionChangedError) {
      return {
        sourceSessionId: session.source_session_id,
        outcome: "attribution-changed",
        detail: published.message,
      };
    }

    if (holdReason) {
      return {
        sourceSessionId: session.source_session_id,
        outcome: "scored-awaiting-review",
        reportId: published.reportId,
        detail: holdReason,
      };
    }

    if (!coachPipelineLive()) {
      return {
        sourceSessionId: session.source_session_id,
        outcome: "scored-awaiting-review",
        reportId: published.reportId,
        detail: PARALLEL_RUN_HOLD,
      };
    }

    if (!this.delivery) {
      await conn
        .updateTable("coach_intake_sessions")
        .set({
          state: "delivery_pending",
          hold_reason: NO_MAILER_HOLD,
          updated_at: sql`NOW()`,
        })
        .where("source_session_id", "=", session.source_session_id)
        .where("state", "=", "scored")
        .execute();
      return {
        sourceSessionId: session.source_session_id,
        outcome: "scored-awaiting-review",
        reportId: published.reportId,
        detail: NO_MAILER_HOLD,
      };
    }

    const result = await this.delivery.deliver({
      reportId: published.reportId,
      evidence: evidenceFrom(scored.dimensions),
    });
    return deliveryOutcome(
      session.source_session_id,
      published.reportId,
      result,
    );
  }
}

function deliveryOutcome(
  sourceSessionId: string,
  reportId: string,
  result: DeliveryResult,
): PipelineResult {
  if (result.delivered) {
    return { sourceSessionId, outcome: "scored-and-delivered", reportId };
  }
  return {
    sourceSessionId,
    outcome:
      result.refusal === "governance-blocked" ||
      result.refusal === "calibration-blocked" ||
      result.refusal === "cold-recall-improvement"
        ? "delivery-blocked"
        : "delivery-failed",
    reportId,
    detail:
      result.violations?.map((v) => v.rule).join(", ") ??
      result.shortfalls?.join("; ") ??
      result.coldRecall?.join("; ") ??
      result.refusal,
  };
}

export async function storedEvidence(
  database: db,
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

/**
 * The structured evidence governance rule 2 compares (task 6.2).
 *
 * Built from the rationales the model actually cited, so "this quote was used
 * before" is a claim about what the report says rather than about its prose.
 */
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
