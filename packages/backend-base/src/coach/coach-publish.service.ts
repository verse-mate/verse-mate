import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { CoachReportsRepository } from "./repository/coach-reports.repository";
import { type ClusterContribution, statusForScore } from "./rubric";

/**
 * Making a scored session LIVE (change: port-coach-pipeline, task 6.8).
 *
 * Going live is a CONSEQUENCE of being scored, not a separate step. On the
 * retired host, publishing meant rebuilding a JSON file, pushing it to
 * `verse-mate`'s default branch and waiting for a deploy — so content cadence
 * was chained to deploy cadence, and a session could sit scored-but-invisible
 * for as long as nobody deployed. Here the write that records the score is the
 * write that makes it readable.
 *
 * Idempotent by construction: it upserts on the reports natural key, so
 * re-scoring the same source session updates the live report in place and
 * never produces a second one.
 */

export interface PublishInput {
  sourceSessionId: string;
  coachId: string;
  sessionDate: string;
  sessionTitle: string;
  base: number;
  clusters: ClusterContribution[];
  dimensions: Array<{
    n: number;
    name: string;
    score: number | null;
    note: string;
  }>;
  bigIdeas: string[];
  feedback: Record<string, unknown>;
  attendees: number;
  newcomers: number;
  duration: string;
  newcomerBonus?: number;
  sizeBonus?: number;
}

export interface PublishResult {
  reportId: string;
  created: boolean;
  /** True when nothing changed — a re-publish of identical content. */
  unchanged: boolean;
}

export class CoachPublishService {
  private readonly reports: CoachReportsRepository;

  constructor(private readonly db: db) {
    this.reports = new CoachReportsRepository(db);
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const conn = this.db.getOrCreateConnection();
    const score =
      Math.round(
        (input.base + (input.newcomerBonus ?? 0) + (input.sizeBonus ?? 0)) * 10,
      ) / 10;
    const status = statusForScore(score);

    const before = await conn
      .selectFrom("coach_reports")
      .select(["id", "summary", "metrics", "body"])
      .where("coach_id", "=", input.coachId)
      .where("source_session_id", "=", input.sourceSessionId)
      .executeTakeFirst();

    const summary = {
      dateLabel: input.sessionDate,
      session: input.sessionTitle,
      topic: input.sessionTitle,
      duration: input.duration,
      attendees: input.attendees,
      newcomers: input.newcomers,
      score,
      status: status.label,
      statusEmoji: status.emoji,
    };
    const metrics = {
      base: input.base,
      newcomerBonus: input.newcomerBonus ?? 0,
      sizeBonus: input.sizeBonus ?? 0,
      clusters: input.clusters,
      dimensions: input.dimensions,
    };
    const body = { bigIdeas: input.bigIdeas, feedback: input.feedback };

    const upserted = await this.reports.upsert({
      id:
        before?.id ??
        `${input.coachId}-${input.sessionDate}-${input.sourceSessionId}`,
      coach_id: input.coachId,
      session_date: input.sessionDate,
      source_session_id: input.sourceSessionId,
      legacy_ids: [],
      summary,
      metrics,
      body,
    });

    // Provenance advances on every publish, so a reader can tell a stale view
    // from a current one.
    await this.reports.bumpMeta(null);

    // Link the session to the report it produced, and mark it scored. The
    // report row existing IS the session being live — there is no second flag
    // to forget to set.
    await conn
      .updateTable("coach_intake_sessions")
      .set({
        report_id: upserted.id,
        state: "scored",
        updated_at: sql`NOW()`,
      })
      .where("source_session_id", "=", input.sourceSessionId)
      .execute();

    // Compared canonically: jsonb does not preserve key order, so a raw
    // JSON.stringify comparison reports every re-publish as a change and the
    // "nothing new to publish" case would never be reachable.
    const unchanged =
      before !== undefined &&
      canonical(before.summary) === canonical(summary) &&
      canonical(before.metrics) === canonical(metrics) &&
      canonical(before.body) === canonical(body);

    return { reportId: upserted.id, created: upserted.created, unchanged };
  }
}

/** JSON with keys sorted at every level. */
function canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, walk(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(walk(value));
}
