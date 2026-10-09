import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { coachPipelineLive } from "./coach-cutover";
import {
  CoachDeliveryService,
  type RevisionSendResult,
} from "./coach-delivery.service";
import {
  CoachGovernanceService,
  type GovernanceViolation,
  coldRecallInFeedback,
  evidenceFromBody,
} from "./coach-governance.service";
import { isLegacyReport, rescoreReport } from "./coach-review.service";
import {
  type BigIdeasReviewRow,
  validBigIdeasReviewRow,
  withBigIdeasReviewRow,
  withoutBigIdeasReviewRow,
} from "./coach-scorecard";
import { STALE_DELIVERY_CLAIM } from "./coach-session-state";
import type { CoachMailer } from "./coach.service";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";
import { FIRST_LESSON_RATIONALE, MEMORY_REINFORCEMENT } from "./rubric";

export const BODY_TEXT_FIELDS = [
  "headline",
  "overview",
  "strengths",
  "improvements",
  "recommendations",
] as const;

export type BodyTextField = (typeof BODY_TEXT_FIELDS)[number];

const PROSE_OF = {
  strengths: "strengthsProse",
  improvements: "improvementsProse",
  recommendations: "recommendationsProse",
} as const;

type ProseField = (typeof PROSE_OF)[keyof typeof PROSE_OF];

export interface Amendment {
  dimensions?: Array<{ n: number; score: number | null; rationale: string }>;
  firstLesson?: boolean;
  bigIdeasReview?: BigIdeasReviewRow;
  body?: Partial<Record<BodyTextField, string | string[]>> &
    Partial<Record<ProseField, Array<{ title: string; paragraphs: string[] }>>>;
}

export type AmendRefusal =
  | "legacy-report"
  | "unknown-report"
  | "not-delivered"
  | "empty-amendment"
  | "unknown-dimension"
  | "score-out-of-range"
  | "memory-reinforcement-required"
  | "big-ideas-review-required"
  | "cold-recall-improvement"
  | "governance-blocked"
  | "revision-sending";

export interface AmendResult {
  applied: boolean;
  refusal?: AmendRefusal;
  violations?: GovernanceViolation[];
  coldRecall?: string[];
  revision?: number;
  firstLesson?: boolean;
  base?: number;
  score?: number;
  status?: { label: string; emoji: string };
  sent?: boolean;
  pending?:
    | "parallel-run"
    | "no-mailer"
    | "send-failed"
    | "in-flight"
    | "not-live";
  sends?: RevisionSendResult["sends"];
  skipped?: string[];
}

type DimensionRow = {
  dimension_n: number;
  score: number | null;
  rationale: string;
  provenance: string;
};

export class CoachAmendService {
  constructor(
    private readonly db: db,
    private readonly mailer: CoachMailer | null,
  ) {}

  async amend(input: {
    reportId: string;
    amendment: Amendment;
    byUserId: string | null;
  }): Promise<AmendResult> {
    const { reportId, amendment } = input;
    const dims = amendment.dimensions ?? [];
    const proseFields = Object.values(PROSE_OF) as string[];
    const bodyChanges = Object.entries(amendment.body ?? {}).filter(
      ([field, value]) =>
        (BODY_TEXT_FIELDS.includes(field as BodyTextField) ||
          proseFields.includes(field)) &&
        value !== undefined,
    ) as Array<[string, unknown]>;
    if (
      dims.length === 0 &&
      amendment.firstLesson === undefined &&
      bodyChanges.length === 0
    )
      return { applied: false, refusal: "empty-amendment" };
    if (dims.some((d) => !Number.isInteger(d.n) || d.n < 1 || d.n > 12))
      return { applied: false, refusal: "unknown-dimension" };
    if (
      dims.some(
        (d) =>
          d.score !== null &&
          (!Number.isInteger(d.score) || d.score < 1 || d.score > 5),
      )
    )
      return { applied: false, refusal: "score-out-of-range" };

    if (await isLegacyReport(this.db, reportId))
      return { applied: false, refusal: "legacy-report" };
    const result: AmendResult = await this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx): Promise<AmendResult> => {
        const report = await trx
          .selectFrom("coach_reports")
          .select(["coach_id", "summary", "metrics", "body", "first_lesson"])
          .where("id", "=", reportId)
          .forUpdate()
          .executeTakeFirst();
        if (!report) return { applied: false, refusal: "unknown-report" };
        const session = await trx
          .selectFrom("coach_intake_sessions")
          .select("state")
          .where("report_id", "=", reportId)
          .executeTakeFirst();
        if (session?.state !== "delivered")
          return { applied: false, refusal: "not-delivered" };
        const sending = await trx
          .selectFrom("coach_report_amendments")
          .select("revision")
          .where("report_id", "=", reportId)
          .where("sent_at", "is", null)
          .where("sending_at", ">=", STALE_DELIVERY_CLAIM)
          .executeTakeFirst();
        if (sending) return { applied: false, refusal: "revision-sending" };

        const current = await trx
          .selectFrom("coach_report_dimension_scores")
          .select(["dimension_n", "score", "rationale", "provenance"])
          .where("report_id", "=", reportId)
          .orderBy("dimension_n")
          .execute();
        const byN = new Map(current.map((d) => [d.dimension_n, d]));
        if (dims.some((d) => !byN.has(d.n)))
          return { applied: false, refusal: "unknown-dimension" };

        const firstLesson = amendment.firstLesson ?? report.first_lesson;
        const next = new Map<number, DimensionRow>(byN);
        for (const d of dims)
          next.set(d.n, {
            dimension_n: d.n,
            score: d.score,
            rationale: d.rationale.trim(),
            provenance: "human",
          });
        if (amendment.firstLesson === true) {
          const given = dims.find((d) => d.n === MEMORY_REINFORCEMENT);
          next.set(MEMORY_REINFORCEMENT, {
            dimension_n: MEMORY_REINFORCEMENT,
            score: null,
            rationale: given?.rationale.trim() || FIRST_LESSON_RATIONALE,
            provenance: "human",
          });
        }
        if (amendment.firstLesson === false && report.first_lesson) {
          const given = dims.find((d) => d.n === MEMORY_REINFORCEMENT);
          if (!given || given.score === null || !given.rationale.trim())
            return { applied: false, refusal: "memory-reinforcement-required" };
        }
        const reviewRow =
          amendment.firstLesson === false && report.first_lesson
            ? validBigIdeasReviewRow(amendment.bigIdeasReview)
            : null;
        if (
          amendment.firstLesson === false &&
          report.first_lesson &&
          !reviewRow
        )
          return { applied: false, refusal: "big-ideas-review-required" };

        const body = (report.body ?? {}) as Record<string, unknown>;
        const storedFeedback = (body.feedback ?? {}) as Record<string, unknown>;
        const feedback: Record<string, unknown> = {
          ...storedFeedback,
          ...Object.fromEntries(bodyChanges),
        };
        const clearedProse = Object.entries(PROSE_OF)
          .filter(
            ([list, prose]) =>
              amendment.body?.[list as BodyTextField] !== undefined &&
              amendment.body?.[prose] === undefined,
          )
          .map(([, prose]) => prose);
        for (const prose of clearedProse) delete feedback[prose];
        const withFeedback = { ...body, feedback };
        const nextBody = reviewRow
          ? withBigIdeasReviewRow(withFeedback, reviewRow)
          : amendment.firstLesson === true
            ? withoutBigIdeasReviewRow(withFeedback)
            : withFeedback;

        if (firstLesson) {
          const coldRecall = coldRecallInFeedback(feedback);
          if (coldRecall.length > 0)
            return {
              applied: false,
              refusal: "cold-recall-improvement",
              coldRecall,
            };
        }

        const nextDims = [...next.values()];
        const evidence = evidenceFromBody(nextBody);
        const verdict = await new CoachGovernanceService({
          getOrCreateConnection: () => trx,
        }).check({
          reportId,
          coachId: report.coach_id,
          body: JSON.stringify({
            body: nextBody,
            rationales: nextDims.map((d) => d.rationale),
          }),
          evidence,
        });
        if (!verdict.passed)
          return {
            applied: false,
            refusal: "governance-blocked",
            violations: verdict.violations,
          };

        const amended = [...next.values()].filter(
          (d) => byN.get(d.dimension_n) !== d,
        );
        const changes = {
          dimensions: amended.map((d) => ({
            n: d.dimension_n,
            from: {
              score: byN.get(d.dimension_n)?.score ?? null,
              rationale: byN.get(d.dimension_n)?.rationale ?? "",
            },
            to: { score: d.score, rationale: d.rationale },
          })),
          ...(amendment.firstLesson !== undefined
            ? {
                firstLesson: {
                  from: report.first_lesson,
                  to: amendment.firstLesson,
                },
              }
            : {}),
          body: Object.fromEntries([
            ...bodyChanges.map(([field, value]) => [
              field,
              { from: storedFeedback[field], to: value },
            ]),
            ...clearedProse
              .filter((prose) => storedFeedback[prose] !== undefined)
              .map((prose) => [
                prose,
                { from: storedFeedback[prose], to: null },
              ]),
          ]),
        };

        const last = await trx
          .selectFrom("coach_report_amendments")
          .select((eb) => eb.fn.max("revision").as("revision"))
          .where("report_id", "=", reportId)
          .executeTakeFirst();
        const revision = Number(last?.revision ?? 0) + 1;
        await trx
          .insertInto("coach_report_amendments")
          .values({
            report_id: reportId,
            revision,
            coach_id: report.coach_id,
            previous: JSON.stringify({
              summary: report.summary,
              metrics: report.metrics,
              body: report.body,
              firstLesson: report.first_lesson,
              dimensions: current.map((d) => ({
                n: d.dimension_n,
                score: d.score,
                rationale: d.rationale,
                provenance: d.provenance,
              })),
            }),
            changes: JSON.stringify(changes),
            amended_by: input.byUserId,
          })
          .execute();
        for (const d of amended) {
          await trx
            .updateTable("coach_report_dimension_scores")
            .set({
              score: d.score,
              rationale: d.rationale,
              provenance: "human",
              corrected_by: input.byUserId,
              updated_at: sql`NOW()`,
            })
            .where("report_id", "=", reportId)
            .where("dimension_n", "=", d.dimension_n)
            .execute();
        }
        await trx
          .updateTable("coach_reports")
          .set({
            body: JSON.stringify(nextBody),
            evidence: JSON.stringify(evidence),
            ...(amendment.firstLesson !== undefined
              ? {
                  first_lesson: amendment.firstLesson,
                  first_lesson_source: "admin",
                }
              : {}),
          })
          .where("id", "=", reportId)
          .execute();
        const stored = await rescoreReport(trx as CoachReportsWriter, reportId);
        return {
          applied: true,
          revision,
          firstLesson,
          base: stored.base,
          score: stored.score,
          status: stored.status,
        };
      });
    if (!result.applied) return result;
    if (!coachPipelineLive())
      return { ...result, sent: false, pending: "parallel-run" };
    if (!this.mailer) return { ...result, sent: false, pending: "no-mailer" };
    const send = await new CoachDeliveryService(
      this.db,
      this.mailer,
    ).sendRevision(reportId);
    const sent = send.sent || send.refusal === "already-sent";
    return {
      ...result,
      sent,
      ...(sent
        ? {}
        : {
            pending:
              send.refusal === "in-flight" || send.refusal === "not-live"
                ? send.refusal
                : ("send-failed" as const),
          }),
      sends: send.sends,
      skipped: send.skipped,
    };
  }
}
