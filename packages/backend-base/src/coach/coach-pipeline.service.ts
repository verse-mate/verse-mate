import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { ObjectStorageService } from "../shared/storage/storage.service";
import { CoachArchiveService } from "./coach-archive.service";
import { coachPipelineLive } from "./coach-cutover";
import {
  CoachDeliveryService,
  type DeliveryResult,
  releaseDeliveredVersions,
} from "./coach-delivery.service";
import { applyFirstLessonDetection } from "./coach-first-lesson";
import { CoachFrameService } from "./coach-frames.service";
import { storedEvidence } from "./coach-governance.service";
import {
  AttributionChangedError,
  CoachPublishService,
} from "./coach-publish.service";
import {
  CoachReportBodyService,
  HISTORY_SESSIONS,
} from "./coach-report-body.service";
import { rescoreReport } from "./coach-review.service";
import {
  AUTHENTICITY_DIMENSION,
  CoachScoringService,
  type ScoringVersion,
  authenticityBaseline,
} from "./coach-scoring.service";
import {
  redeliverable,
  scorable,
  scoringVersionLiteral,
  unsentAfterPublish,
  versionDeliveredToLeader,
  waitingOnAPersonLast,
} from "./coach-session-state";
import { timedLinesFrom } from "./coach-transcript";
import type { CoachMailer } from "./coach.service";
import type {
  FirefliesDetailClient,
  FirefliesTranscriptDetail,
} from "./fireflies.client";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";

/**
 * The pipeline, connected (change: port-coach-pipeline).
 *
 * Each stage was built and tested on its own and then never joined up: the
 * worker ran intake and retrieval and stopped, so scoring, publishing,
 * delivery, frame extraction, coverage and retention
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
  | "attribution-changed"
  | "attribution-unresolved";

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

function newVersionHold(version: ScoringVersion | undefined): string {
  return `held for review: the first report to this leader under scoring version ${version?.languageModel ?? "unknown"} / prompt ${version?.promptVersion ?? "unknown"} / settings ${JSON.stringify(version?.settings ?? null)}`;
}

export class CoachPipelineService {
  private readonly scoring: CoachScoringService;
  private readonly frames: CoachFrameService;
  private readonly publish: CoachPublishService;
  private readonly delivery: CoachDeliveryService | null;
  private readonly body: CoachReportBodyService;
  private readonly storage: Pick<ObjectStorageService, "getGlobalObjectText">;

  constructor(
    private readonly db: db,
    private readonly fireflies: FirefliesDetailClient,
    mailer: CoachMailer | null,
    deps: {
      scoring?: CoachScoringService;
      frames?: CoachFrameService;
      publish?: CoachPublishService;
      delivery?: CoachDeliveryService;
      body?: CoachReportBodyService;
      storage?: Pick<ObjectStorageService, "getGlobalObjectText">;
    } = {},
  ) {
    this.storage = deps.storage ?? new ObjectStorageService();
    this.scoring = deps.scoring ?? new CoachScoringService(db);
    this.body = deps.body ?? new CoachReportBodyService(this.scoring.ai);
    this.frames = deps.frames ?? new CoachFrameService();
    this.publish = deps.publish ?? new CoachPublishService(db);
    this.delivery =
      deps.delivery ?? (mailer ? new CoachDeliveryService(db, mailer) : null);
  }

  /** Carry every session whose material is retained through to a report. */
  async run(opts: { uploadsOnly?: boolean } = {}): Promise<PipelineResult[]> {
    const due = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_intake_sessions")
      .select([
        "source_session_id",
        "coach_id",
        "title",
        "retry_count",
        "parallel_run",
        "rotating_class_id",
        "source",
      ])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where(scorable)
      .$if(opts.uploadsOnly === true, (q) => q.where("source", "=", "upload"))
      .orderBy("retry_count")
      .orderBy("observed_at")
      // Bounded: each session is a model call plus a frame extraction, so an
      // unbounded tick could spend an unbounded amount of money.
      .limit(PIPELINE_BATCH_LIMIT)
      .execute();

    const out: PipelineResult[] = opts.uploadsOnly
      ? []
      : await this.redeliver();
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
    await releaseDeliveredVersions(this.db);
    const conn = this.db.getOrCreateConnection();
    const pending = await conn
      .selectFrom("coach_intake_sessions")
      .select(["source_session_id", "report_id"])
      .where(redeliverable)
      .orderBy(waitingOnAPersonLast)
      .orderBy("retry_count")
      .orderBy("updated_at")
      .limit(PIPELINE_BATCH_LIMIT)
      .execute();

    const out: PipelineResult[] = [];
    for (const session of pending) {
      const reportId = session.report_id as string;
      try {
        const result = await delivery.deliver({
          reportId,
          evidence: await storedEvidence(this.db, reportId),
        });
        out.push(deliveryOutcome(session.source_session_id, reportId, result));
      } catch (error) {
        console.error(
          `[COACH-PIPELINE] redelivery of ${session.source_session_id} threw:`,
          error,
        );
        out.push({
          sourceSessionId: session.source_session_id,
          outcome: "delivery-failed",
          reportId,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
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

  private async firstLessonFor(
    sourceSessionId: string,
    detected: string | null,
  ): Promise<boolean> {
    const stored = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select(["first_lesson", "first_lesson_source"])
      .where("source_session_id", "=", sourceSessionId)
      .executeTakeFirst();
    return stored?.first_lesson_source === "admin"
      ? stored.first_lesson
      : detected !== null;
  }

  private async benchmarkHistory(
    coachId: string,
    sessionDate: string,
    sourceSessionId: string,
  ) {
    const conn = this.db.getOrCreateConnection();
    const leader = await conn
      .selectFrom("coach_leaders")
      .select("is_benchmark")
      .where("slug", "=", coachId)
      .executeTakeFirst();
    if (!leader?.is_benchmark) return null;
    const prior = await conn
      .selectFrom("coach_reports")
      .select(["metrics"])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where("coach_id", "=", coachId)
      .where("session_date", "<", sql<Date>`${sessionDate}::date`)
      .where("source_session_id", "!=", sourceSessionId)
      .orderBy("session_date", "desc")
      .limit(HISTORY_SESSIONS)
      .execute();
    return prior.map((p) => ({
      date: p.date,
      dimensions: (
        ((p.metrics ?? {}) as { dimensions?: Array<Record<string, unknown>> })
          .dimensions ?? []
      ).map((d) => ({
        n: Number(d.n),
        score: typeof d.score === "number" ? d.score : null,
      })),
    }));
  }

  private async deliveredUnder(
    coachId: string,
    version: ScoringVersion | undefined,
  ): Promise<boolean> {
    if (!version) return false;
    const { rows } = await sql<{
      delivered: boolean;
    }>`SELECT ${versionDeliveredToLeader(
      sql.val(coachId),
      scoringVersionLiteral(version),
    )} AS delivered`.execute(this.db.getOrCreateConnection());
    return rows[0]?.delivered === true;
  }

  private async queueForRedelivery(sourceSessionId: string): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .updateTable("coach_intake_sessions")
      .set({ state: "delivery_pending", updated_at: sql`NOW()` })
      .where("source_session_id", "=", sourceSessionId)
      .where(unsentAfterPublish)
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

  private async detailFor(
    session: { source_session_id: string; source: string },
    leaderName: string | null,
  ): Promise<{
    sentences: FirefliesTranscriptDetail["sentences"];
    duration: number | null;
    participantCount: number | null;
  } | null> {
    if (session.source !== "upload")
      return this.fireflies.getTranscript(
        session.source_session_id,
        leaderName,
      );
    const stored = await this.storage.getGlobalObjectText(
      CoachArchiveService.transcriptKey(session.source_session_id),
    );
    if (!stored) return null;
    const parsed = JSON.parse(stored) as {
      sentences?: FirefliesTranscriptDetail["sentences"];
      duration?: number | null;
    };
    return {
      sentences: parsed.sentences ?? [],
      duration: parsed.duration ?? null,
      participantCount: null,
    };
  }

  private async nameLeader(session: {
    source_session_id: string;
    source: string;
    rotating_class_id: number | null;
  }): Promise<string | null> {
    const conn = this.db.getOrCreateConnection();
    const leaders = await conn
      .selectFrom("coach_rotating_class_leaders")
      .innerJoin(
        "coach_leaders",
        "coach_leaders.slug",
        "coach_rotating_class_leaders.leader_slug",
      )
      .select(["coach_leaders.slug as slug", "coach_leaders.name as name"])
      .where("class_id", "=", session.rotating_class_id as number)
      .orderBy("coach_leaders.slug")
      .execute();
    const detail = await this.detailFor(session, null);
    if (!detail) throw new Error("the transcript could not be read");
    const named = await this.scoring.nameRotatingLeader({
      transcript: timedLinesFrom(detail.sentences),
      leaders: leaders.map((l) => ({
        slug: l.slug as string,
        name: l.name,
      })),
    });
    const updated = await conn
      .updateTable("coach_intake_sessions")
      .set(
        named
          ? {
              coach_id: named.slug,
              leader_cue: named.cue,
              leader_cue_line: named.line,
              updated_at: sql`NOW()`,
            }
          : { leader_cue: "none", updated_at: sql`NOW()` },
      )
      .where("source_session_id", "=", session.source_session_id)
      .where("coach_id", "is", null)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      const now = await conn
        .selectFrom("coach_intake_sessions")
        .select("coach_id")
        .where("source_session_id", "=", session.source_session_id)
        .executeTakeFirst();
      return now?.coach_id ?? null;
    }
    if (named)
      await conn
        .updateTable("coach_session_assets")
        .set({ coach_id: named.slug })
        .where("source_session_id", "=", session.source_session_id)
        .execute();
    return named?.slug ?? null;
  }

  private async uploadedByAnother(
    session: { source_session_id: string; source: string },
    coachId: string,
  ): Promise<string | null> {
    if (session.source !== "upload") return null;
    const upload = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_uploads")
      .select("coach_id")
      .where("source_session_id", "=", session.source_session_id)
      .executeTakeFirst();
    return upload && upload.coach_id !== coachId
      ? "held for review: uploaded for another leader of the class than the one the transcript names"
      : null;
  }

  private async runOne(session: {
    source_session_id: string;
    coach_id: string | null;
    title: string;
    date: string;
    parallel_run: boolean;
    source: string;
    rotating_class_id: number | null;
  }): Promise<PipelineResult> {
    const conn = this.db.getOrCreateConnection();
    const coachId = session.coach_id ?? (await this.nameLeader(session));
    if (!coachId)
      return {
        sourceSessionId: session.source_session_id,
        outcome: "attribution-unresolved",
        detail:
          "the transcript did not name which of the rotating class's leaders led",
      };

    const leader = await conn
      .selectFrom("coach_leaders")
      .select("name")
      .where("slug", "=", coachId)
      .executeTakeFirst();

    const detail = await this.detailFor(session, leader?.name ?? null);
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

    const transcript = timedLinesFrom(detail.sentences);
    const scored = await this.scoring.scoreSession({
      transcript,
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
    const generated = await this.body.generate({
      sessionTitle: session.title,
      sessionDate: session.date,
      duration: `${detail.duration ?? 0} min`,
      attendees: detail.participantCount ?? null,
      newcomers: scored.newcomers ?? 0,
      transcript,
      dimensions,
      firstLesson: await this.firstLessonFor(
        session.source_session_id,
        scored.firstLessonLine ?? null,
      ),
      history: await this.benchmarkHistory(
        coachId,
        session.date,
        session.source_session_id,
      ),
    });
    const delivering = !session.parallel_run && coachPipelineLive();
    const holdReason =
      [
        scored.reviewReason,
        await this.uploadedByAnother(session, coachId),
        generated.issues.length > 0
          ? `held for review: report body: ${generated.issues.join("; ")}`
          : null,
      ]
        .filter(Boolean)
        .join("; ") || null;
    const versionHold =
      delivering && !(await this.deliveredUnder(coachId, scored.producedBy))
        ? newVersionHold(scored.producedBy)
        : null;
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
            bigIdeas: generated.body.bigIdeas,
            feedback: generated.body.feedback,
            sections: generated.body.sections,
            keyMoments: generated.body.keyMoments,
            contextLine: generated.body.contextLine,
            topic: generated.body.topic,
            attendees: detail.participantCount ?? null,
            newcomers: scored.newcomers ?? 0,
            duration: `${detail.duration ?? 0} min`,
            holdReason,
            newVersionHold: versionHold,
          },
          trx as CoachReportsWriter,
        );
        await this.scoring.persistDimensions(
          report.reportId,
          dimensions,
          trx as CoachReportsWriter,
          scored.producedBy,
        );
        await applyFirstLessonDetection(
          trx as CoachReportsWriter,
          report.reportId,
          scored.firstLessonLine ?? null,
        );
        await rescoreReport(trx as CoachReportsWriter, report.reportId);
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

    if (published.holdReason) {
      return {
        sourceSessionId: session.source_session_id,
        outcome: "scored-awaiting-review",
        reportId: published.reportId,
        detail: published.holdReason,
      };
    }

    if (session.parallel_run || !coachPipelineLive()) {
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
          hold_kind: "no-mailer",
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
      evidence: await storedEvidence(this.db, published.reportId),
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
      result.refusal === "cold-recall-improvement"
        ? "delivery-blocked"
        : "delivery-failed",
    reportId,
    detail:
      result.violations?.map((v) => v.rule).join(", ") ??
      result.coldRecall?.join("; ") ??
      result.refusal,
  };
}
