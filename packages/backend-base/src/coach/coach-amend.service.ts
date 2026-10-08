import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { coachPipelineLive } from "./coach-cutover";
import {
  CoachDeliveryService,
  type RevisionSendResult,
} from "./coach-delivery.service";
import {
  FIRST_LESSON_RATIONALE,
  MEMORY_REINFORCEMENT,
} from "./coach-first-lesson";
import {
  CoachGovernanceService,
  type GovernanceViolation,
} from "./coach-governance.service";
import { evidenceFrom } from "./coach-pipeline.service";
import { isLegacyReport, rescoreReport } from "./coach-review.service";
import type { CoachMailer } from "./coach.service";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";

export const BODY_TEXT_FIELDS = [
  "headline",
  "overview",
  "strengths",
  "improvements",
  "recommendations",
] as const;

export type BodyTextField = (typeof BODY_TEXT_FIELDS)[number];

export interface Amendment {
  dimensions?: Array<{ n: number; score: number | null; rationale: string }>;
  firstLesson?: boolean;
  body?: Partial<Record<BodyTextField, string | string[]>>;
}

export type AmendRefusal =
  | "legacy-report"
  | "unknown-report"
  | "not-delivered"
  | "empty-amendment"
  | "unknown-dimension"
  | "score-out-of-range"
  | "memory-reinforcement-required"
  | "cold-recall-improvement"
  | "governance-blocked";

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
  pending?: "parallel-run" | "no-mailer" | "send-failed";
  sends?: RevisionSendResult["sends"];
  skipped?: string[];
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
    const bodyChanges = Object.entries(amendment.body ?? {}).filter(
      ([field, value]) =>
        BODY_TEXT_FIELDS.includes(field as BodyTextField) &&
        value !== undefined,
    ) as Array<[BodyTextField, string | string[]]>;
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
    const conn = this.db.getOrCreateConnection();
    const report = await conn
      .selectFrom("coach_reports")
      .select(["coach_id", "summary", "metrics", "body", "first_lesson"])
      .where("id", "=", reportId)
      .executeTakeFirst();
    if (!report) return { applied: false, refusal: "unknown-report" };
    const session = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("report_id", "=", reportId)
      .executeTakeFirst();
    if (session?.state !== "delivered")
      return { applied: false, refusal: "not-delivered" };

    const current = await conn
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

    const body = (report.body ?? {}) as Record<string, unknown>;
    const feedback = {
      ...((body.feedback ?? {}) as Record<string, unknown>),
      ...Object.fromEntries(bodyChanges),
    };
    const nextBody = { ...body, feedback };

    if (firstLesson) {
      const coldRecall = coldRecallImprovements(feedback.improvements);
      if (coldRecall.length > 0)
        return {
          applied: false,
          refusal: "cold-recall-improvement",
          coldRecall,
        };
    }

    const nextDims = [...next.values()];
    const evidence = evidenceFrom(nextDims.map((d) => ({ note: d.rationale })));
    const verdict = await new CoachGovernanceService(this.db).check({
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
      body: Object.fromEntries(
        bodyChanges.map(([field, value]) => [
          field,
          {
            from: ((body.feedback ?? {}) as Record<string, unknown>)[field],
            to: value,
          },
        ]),
      ),
    };

    const stored = await conn.transaction().execute(async (trx) => {
      await trx
        .selectFrom("coach_reports")
        .select("id")
        .where("id", "=", reportId)
        .forUpdate()
        .execute();
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
      return {
        revision,
        ...(await rescoreReport(trx as CoachReportsWriter, reportId)),
      };
    });

    const result: AmendResult = {
      applied: true,
      revision: stored.revision,
      firstLesson,
      base: stored.base,
      score: stored.score,
      status: stored.status,
    };
    if (!coachPipelineLive())
      return { ...result, sent: false, pending: "parallel-run" };
    if (!this.mailer) return { ...result, sent: false, pending: "no-mailer" };
    const send = await new CoachDeliveryService(
      this.db,
      this.mailer,
    ).sendRevision(reportId);
    return {
      ...result,
      sent: send.sent,
      ...(send.sent ? {} : { pending: "send-failed" as const }),
      sends: send.sends,
      skipped: send.skipped,
    };
  }
}
