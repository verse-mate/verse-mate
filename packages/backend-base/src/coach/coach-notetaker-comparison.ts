import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { type FLAG_REASONS, compareScores } from "./coach-parallel-run";
import { NOTETAKER_SOURCE } from "./coach-session-state";
import { DIMENSIONS, composeBaseScore, composeComposite } from "./rubric";

/**
 * The notetaker shadow beside the Fireflies bot, class by class.
 *
 * Each notetaker session is paired with the bot's session of the same class on
 * the same date: the same leader (or rotating class), then the same class key
 * when a leader teaches more than one class that day. A pair whose sessions
 * are both scored carries the same comparison the parallel run makes against
 * the old host (compareScores), on the MACHINE scores of each, so an admin's
 * correction to the bot's report does not read as a difference between the
 * recordings. Read-only: it changes nothing and sends nothing.
 */

export interface NotetakerSide {
  sourceSessionId: string;
  state: string;
  reportId: string | null;
  composite: number | null;
}

export interface NotetakerScoreComparison {
  compositeDifference: number | null;
  dimensions: Array<{
    n: number;
    fireflies: number | null;
    notetaker: number | null;
    difference: number | null;
  }>;
  withinOne: number;
  comparable: number;
  flagged: boolean;
  flagReasons: Array<(typeof FLAG_REASONS)[number]>;
}

interface Where {
  coachId: string | null;
  rotatingClassId: number | null;
  date: string;
}

export interface NotetakerPair extends Where {
  classKey: string | null;
  fireflies: NotetakerSide;
  notetaker: NotetakerSide;
  /** Null until both sessions are scored. */
  comparison: NotetakerScoreComparison | null;
}

export interface NotetakerComparison {
  enabled: boolean;
  /** The first date compared: COACH_NOTETAKER_SINCE, else the first shadow session's. */
  since: string | null;
  pairs: NotetakerPair[];
  needsPairing: Array<
    Where & { fireflies: NotetakerSide[]; notetaker: NotetakerSide[] }
  >;
  unmatched: {
    fireflies: Array<Where & NotetakerSide>;
    notetaker: Array<Where & NotetakerSide>;
  };
  share: { withinOne: number; comparable: number; ratio: number | null };
  counts: {
    pairs: number;
    compared: number;
    flagged: number;
    needsPairing: number;
    unmatchedFireflies: number;
    unmatchedNotetaker: number;
  };
}

export async function notetakerComparison(
  database: db,
  opts: { enabled: boolean; since: string | null },
): Promise<NotetakerComparison> {
  const conn = database.getOrCreateConnection();
  const since =
    opts.since ??
    (
      await conn
        .selectFrom("coach_intake_sessions")
        .select(
          sql<string | null>`to_char(min(session_date), 'YYYY-MM-DD')`.as(
            "first",
          ),
        )
        .where("source", "=", NOTETAKER_SOURCE)
        .executeTakeFirst()
    )?.first ??
    null;
  const out: NotetakerComparison = {
    enabled: opts.enabled,
    since,
    pairs: [],
    needsPairing: [],
    unmatched: { fireflies: [], notetaker: [] },
    share: { withinOne: 0, comparable: 0, ratio: null },
    counts: {
      pairs: 0,
      compared: 0,
      flagged: 0,
      needsPairing: 0,
      unmatchedFireflies: 0,
      unmatchedNotetaker: 0,
    },
  };
  if (!since) return out;

  const rows = await conn
    .selectFrom("coach_intake_sessions as s")
    .leftJoin("coach_reports as r", "r.id", "s.report_id")
    .select([
      "s.source_session_id as sourceSessionId",
      "s.source as source",
      "s.coach_id as coachId",
      "s.rotating_class_id as rotatingClassId",
      "s.class_key as classKey",
      "s.state as state",
      "r.id as reportId",
      "r.metrics as metrics",
    ])
    .select(sql<string>`to_char(s.session_date, 'YYYY-MM-DD')`.as("date"))
    .where("s.source", "in", ["bot", NOTETAKER_SOURCE])
    .where("s.session_date", ">=", sql<Date>`${since}::date`)
    .orderBy("s.session_date")
    .orderBy("s.source_session_id")
    .execute();

  const reportIds = rows
    .map((r) => r.reportId)
    .filter((id): id is string => id !== null);
  const machine =
    reportIds.length === 0
      ? []
      : await conn
          .selectFrom("coach_report_dimension_scores")
          .select(["report_id", "dimension_n", "machine_score"])
          .where("report_id", "in", reportIds)
          .execute();
  const scoresByReport = new Map<string, Map<number, number | null>>();
  for (const m of machine) {
    const scores = scoresByReport.get(m.report_id) ?? new Map();
    scores.set(m.dimension_n, m.machine_score);
    scoresByReport.set(m.report_id, scores);
  }

  type Row = (typeof rows)[number];
  const scoresOf = (r: Row) => {
    const scores = r.reportId ? scoresByReport.get(r.reportId) : undefined;
    return scores && scores.size > 0 ? scores : null;
  };
  const side = (r: Row): NotetakerSide => {
    const scores = scoresOf(r);
    const bonuses = (r.metrics ?? {}) as Record<string, unknown>;
    return {
      sourceSessionId: r.sourceSessionId,
      state: r.state,
      reportId: r.reportId,
      composite: scores
        ? composeComposite(composeBaseScore(scores).base, {
            newcomerBonus: Number(bonuses.newcomerBonus ?? 0),
            sizeBonus: Number(bonuses.sizeBonus ?? 0),
          })
        : null,
    };
  };
  const where = (r: Row): Where => ({
    coachId: r.coachId,
    rotatingClassId: r.rotatingClassId,
    date: r.date,
  });

  // A rotating class keeps its class id after the leader is named, so it
  // groups on that; a leader's own class on the leader. An unattributed
  // session has nothing to pair on.
  const groups = new Map<string, { bot: Row[]; shadow: Row[] }>();
  for (const r of rows) {
    const owner =
      r.rotatingClassId !== null
        ? `rotating:${r.rotatingClassId}`
        : r.coachId !== null
          ? `leader:${r.coachId}`
          : `session:${r.sourceSessionId}`;
    const key = `${r.date}\u0000${owner}`;
    const group = groups.get(key) ?? { bot: [], shadow: [] };
    (r.source === NOTETAKER_SOURCE ? group.shadow : group.bot).push(r);
    groups.set(key, group);
  }

  const pair = (b: Row, n: Row) => {
    const fireflies = side(b);
    const notetaker = side(n);
    const botScores = scoresOf(b);
    const shadowScores = scoresOf(n);
    let comparison: NotetakerScoreComparison | null = null;
    if (botScores && shadowScores) {
      const dims = (s: Map<number, number | null>) =>
        DIMENSIONS.map((d) => s.get(d.n) ?? null);
      const compared = compareScores(
        { composite: fireflies.composite, dimensions: dims(botScores) },
        { composite: notetaker.composite, dimensions: dims(shadowScores) },
      );
      comparison = {
        ...compared,
        dimensions: compared.dimensions.map((d) => ({
          n: d.n,
          fireflies: d.host,
          notetaker: d.backend,
          difference: d.difference,
        })),
      };
    }
    out.pairs.push({
      ...where(n.coachId !== null ? n : b),
      classKey: n.classKey ?? b.classKey,
      fireflies,
      notetaker,
      comparison,
    });
  };

  for (const group of groups.values()) {
    const bots = [...group.bot];
    const shadows: Row[] = [];
    // Same class key first: a leader who teaches twice that day.
    for (const n of group.shadow) {
      const i = n.classKey
        ? bots.findIndex((b) => b.classKey === n.classKey)
        : -1;
      if (i >= 0) pair(bots.splice(i, 1)[0], n);
      else shadows.push(n);
    }
    if (bots.length === 1 && shadows.length === 1) {
      pair(bots[0], shadows[0]);
      continue;
    }
    if (bots.length > 0 && shadows.length > 0) {
      out.needsPairing.push({
        ...where(shadows[0]),
        fireflies: bots.map(side),
        notetaker: shadows.map(side),
      });
      continue;
    }
    for (const b of bots)
      out.unmatched.fireflies.push({ ...where(b), ...side(b) });
    for (const n of shadows)
      out.unmatched.notetaker.push({ ...where(n), ...side(n) });
  }

  const byPlace = (a: Where, b: Where) =>
    a.date === b.date
      ? `${a.coachId ?? ""}`.localeCompare(`${b.coachId ?? ""}`)
      : a.date.localeCompare(b.date);
  out.pairs.sort(byPlace);
  out.needsPairing.sort(byPlace);
  out.unmatched.fireflies.sort(byPlace);
  out.unmatched.notetaker.sort(byPlace);

  const compared = out.pairs
    .map((p) => p.comparison)
    .filter((c): c is NotetakerScoreComparison => c !== null);
  out.share.withinOne = compared.reduce((n, c) => n + c.withinOne, 0);
  out.share.comparable = compared.reduce((n, c) => n + c.comparable, 0);
  out.share.ratio =
    out.share.comparable > 0
      ? out.share.withinOne / out.share.comparable
      : null;
  out.counts = {
    pairs: out.pairs.length,
    compared: compared.length,
    flagged: compared.filter((c) => c.flagged).length,
    needsPairing: out.needsPairing.length,
    unmatchedFireflies: out.unmatched.fireflies.length,
    unmatchedNotetaker: out.unmatched.notetaker.length,
  };
  return out;
}
