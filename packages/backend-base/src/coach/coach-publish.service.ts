import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import {
  CoachReportsRepository,
  type CoachReportsWriter,
} from "./repository/coach-reports.repository";
import {
  type ClusterContribution,
  composeBonuses,
  composeComposite,
  statusForScore,
} from "./rubric";

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
  holdReason: string | null;
}

export interface PublishResult {
  reportId: string;
  created: boolean;
  /** True when nothing changed, a re-publish of identical content. */
  unchanged: boolean;
}

export class CoachPublishService {
  private readonly reports: CoachReportsRepository;

  constructor(private readonly db: db) {
    this.reports = new CoachReportsRepository(db);
  }

  async publish(
    input: PublishInput,
    writer?: CoachReportsWriter,
  ): Promise<PublishResult> {
    if (!writer) {
      return this.reports.transaction((trx) => this.publish(input, trx));
    }
    const conn = writer;
    // Computed here when the caller did not, from the head counts it passed.
    // Nothing used to compute them at all, so every report scored base-only.
    const derived = composeBonuses({
      attendees: input.attendees,
      newcomers: input.newcomers,
    });
    const bonuses = {
      newcomerBonus: input.newcomerBonus ?? derived.newcomerBonus,
      sizeBonus: input.sizeBonus ?? derived.sizeBonus,
    };
    const score = composeComposite(input.base, bonuses);
    const status = statusForScore(score);

    // Found by SESSION, not by (leader, session): a session that has been
    // re-attributed still has exactly one report, and this is the row that
    // moves rather than a second one appearing under the new leader.
    const before = await conn
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "summary", "metrics", "body"])
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
      newcomerBonus: bonuses.newcomerBonus,
      sizeBonus: bonuses.sizeBonus,
      clusters: input.clusters,
      dimensions: input.dimensions,
    };
    const body = { bigIdeas: input.bigIdeas, feedback: input.feedback };

    const upserted = await this.reports.upsert(
      {
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
        held: true,
      },
      writer,
    );

    // Provenance advances on every publish, so a reader can tell a stale view
    // from a current one.
    await this.reports.bumpMeta(null, writer);

    // Link the session to the report it produced, and mark it scored. The
    // report row existing IS the session being live, there is no second flag
    // to forget to set.
    await conn
      .updateTable("coach_intake_sessions")
      .set({
        report_id: upserted.id,
        state: "scored",
        retry_count: 0,
        hold_reason: input.holdReason,
        updated_at: sql`NOW()`,
      })
      .where("source_session_id", "=", input.sourceSessionId)
      .execute();

    // And link the RETAINED ASSETS to it. The archive stages them before a
    // report exists, it is keyed on the source session for exactly that
    // reason, so this is the only moment the link can be made. Without it
    // `coach_session_assets.report_id` stays NULL forever: the mint endpoint
    // finds nothing and 404s for every session, the detail view reports no
    // recording, and migration 7's ON DELETE CASCADE never fires, so deleting
    // a report leaves its video paid for and unreachable.
    await conn
      .updateTable("coach_session_assets")
      .set({ report_id: upserted.id })
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
