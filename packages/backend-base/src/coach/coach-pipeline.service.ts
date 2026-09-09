import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { CoachArchiveService } from "./coach-archive.service";
import { CoachDeliveryService } from "./coach-delivery.service";
import { CoachFrameService } from "./coach-frames.service";
import type { ReportEvidence } from "./coach-governance.service";
import { CoachPublishService } from "./coach-publish.service";
import { CoachScoringService } from "./coach-scoring.service";
import type { CoachMailer } from "./coach.service";
import type { FirefliesDetailClient } from "./fireflies.client";

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
  | "delivery-failed";

export interface PipelineResult {
  sourceSessionId: string;
  outcome: PipelineOutcome;
  reportId?: string;
  detail?: string;
}

/** How many retained sessions one tick carries through to a report. */
export const PIPELINE_BATCH_LIMIT = 5;

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
      .select(["source_session_id", "coach_id", "title"])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where("state", "=", "retained")
      .where("coach_id", "is not", null)
      .orderBy("observed_at")
      // Bounded: each session is a model call plus a frame extraction, so an
      // unbounded tick could spend an unbounded amount of money.
      .limit(PIPELINE_BATCH_LIMIT)
      .execute();

    const out: PipelineResult[] = [];
    for (const session of due) {
      try {
        out.push(await this.runOne(session));
      } catch (error) {
        console.error(
          `[COACH-PIPELINE] ${session.source_session_id} threw:`,
          error,
        );
        out.push({
          sourceSessionId: session.source_session_id,
          outcome: "scoring-failed",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return out;
  }

  private async runOne(session: {
    source_session_id: string;
    coach_id: string | null;
    title: string;
    date: string;
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
    });
    if (!scored.ok || !scored.dimensions) {
      return {
        sourceSessionId: session.source_session_id,
        outcome: "scoring-failed",
        detail: `${scored.failure}: ${scored.detail ?? ""}`.trim(),
      };
    }

    // Publish FIRST, this creates the report row the dimension scores' foreign
    // key needs, then persist the dimensions into it.
    const published = await this.publish.publish({
      sourceSessionId: session.source_session_id,
      coachId,
      sessionDate: session.date,
      sessionTitle: session.title,
      base: scored.base ?? 0,
      clusters: scored.clusters ?? [],
      dimensions: scored.dimensions,
      // WELL-FORMED, even though the port produces no narrative prose. The
      // list response is validated as a whole against ReportSchema, which
      // requires `feedback` and its four arrays, so a report published with
      // `feedback: {}` failed validation and took the leader's ENTIRE session
      // list down with it (422, "Something went wrong loading your coaching
      // data"). The same failure mode the docUrl/pdfUrl comment in
      // coach.schema.ts describes, found by running the pipeline end to end.
      //
      // Empty rather than invented: the dimension scores and their rationales
      // are the real output, and prose generation is not part of this port.
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
    });
    await this.scoring.persistDimensions(published.reportId, scored.dimensions);

    // A uniform maximum is indistinguishable from a successful prompt
    // injection, so it waits for a human instead of reaching the leader.
    if (scored.needsReview) {
      return {
        sourceSessionId: session.source_session_id,
        outcome: "scored-awaiting-review",
        reportId: published.reportId,
        detail: "every dimension came back at the maximum",
      };
    }

    if (!this.delivery) {
      return {
        sourceSessionId: session.source_session_id,
        outcome: "scored-awaiting-review",
        reportId: published.reportId,
        detail: "no mailer is configured, so the report is live but unsent",
      };
    }

    const result = await this.delivery.deliver({
      reportId: published.reportId,
      evidence: evidenceFrom(scored.dimensions),
    });
    if (result.delivered) {
      return {
        sourceSessionId: session.source_session_id,
        outcome: "scored-and-delivered",
        reportId: published.reportId,
      };
    }
    return {
      sourceSessionId: session.source_session_id,
      outcome:
        result.refusal === "governance-blocked"
          ? "delivery-blocked"
          : "delivery-failed",
      reportId: published.reportId,
      detail:
        result.violations?.map((v) => v.rule).join(", ") ?? result.refusal,
    };
  }
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
