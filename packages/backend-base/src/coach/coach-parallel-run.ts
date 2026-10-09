import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { DIMENSIONS, composeBaseScore, composeComposite } from "./rubric";

export const FLAG_COMPOSITE_DIFFERENCE = 5;
export const FLAG_DIMENSION_DIFFERENCE = 2;

export interface ScoreSide {
  composite: number | null;
  dimensions: Array<number | null>;
}

export interface DimensionComparison {
  n: number;
  host: number | null;
  backend: number | null;
  difference: number | null;
}

export interface ScoreComparison {
  compositeDifference: number | null;
  dimensions: DimensionComparison[];
  withinOne: number;
  comparable: number;
  flagged: boolean;
}

export interface ComparedSession extends ScoreComparison {
  coachId: string;
  date: string;
  backend: { sourceSessionId: string; reportId: string; composite: number };
  host: { reportId: string; composite: number | null };
}

export interface ParallelRunComparison {
  sessions: ComparedSession[];
  needsPairing: Array<{
    coachId: string;
    date: string;
    backend: Array<{ sourceSessionId: string; reportId: string }>;
    host: Array<{ reportId: string }>;
  }>;
  unmatched: {
    backend: Array<{
      coachId: string;
      date: string;
      sourceSessionId: string;
      reportId: string;
    }>;
    host: Array<{ coachId: string; date: string; reportId: string }>;
  };
  share: { withinOne: number; comparable: number; ratio: number | null };
  counts: {
    compared: number;
    flagged: number;
    needsPairing: number;
    unmatchedBackend: number;
    unmatchedHost: number;
  };
}

const rounded = (n: number) => Math.round(n * 100) / 100;

export function compareScores(
  host: ScoreSide,
  backend: ScoreSide,
): ScoreComparison {
  const length = Math.max(host.dimensions.length, backend.dimensions.length);
  const dimensions = Array.from({ length }, (_, i) => {
    const h = host.dimensions[i] ?? null;
    const b = backend.dimensions[i] ?? null;
    return {
      n: i + 1,
      host: h,
      backend: b,
      difference: h === null || b === null ? null : rounded(Math.abs(b - h)),
    };
  });
  const comparable = dimensions.filter((d) => d.difference !== null);
  const compositeDifference =
    host.composite === null || backend.composite === null
      ? null
      : rounded(Math.abs(backend.composite - host.composite));
  return {
    compositeDifference,
    dimensions,
    withinOne: comparable.filter((d) => (d.difference as number) <= 1).length,
    comparable: comparable.length,
    flagged:
      (compositeDifference ?? 0) > FLAG_COMPOSITE_DIFFERENCE ||
      comparable.some(
        (d) => (d.difference as number) >= FLAG_DIMENSION_DIFFERENCE,
      ),
  };
}

function scoreOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hostDimensions(metrics: unknown): Array<number | null> {
  const listed = (metrics as { dimensions?: unknown })?.dimensions;
  const byN = new Map(
    (Array.isArray(listed) ? listed : []).map((d) => [
      Number((d as { n?: unknown }).n),
      scoreOrNull((d as { score?: unknown }).score),
    ]),
  );
  return DIMENSIONS.map((d) => byN.get(d.n) ?? null);
}

export async function parallelRunComparison(
  database: db,
): Promise<ParallelRunComparison> {
  const conn = database.getOrCreateConnection();
  const backendRows = await conn
    .selectFrom("coach_intake_sessions")
    .innerJoin(
      "coach_reports",
      "coach_reports.id",
      "coach_intake_sessions.report_id",
    )
    .select([
      "coach_intake_sessions.source_session_id as sourceSessionId",
      "coach_intake_sessions.coach_id as coachId",
      "coach_reports.id as reportId",
      "coach_reports.metrics as metrics",
    ])
    .select(
      sql<string>`to_char(coach_intake_sessions.session_date, 'YYYY-MM-DD')`.as(
        "date",
      ),
    )
    .where("coach_intake_sessions.parallel_run", "=", true)
    .where("coach_intake_sessions.coach_id", "is not", null)
    .orderBy("coach_intake_sessions.session_date")
    .orderBy("coach_intake_sessions.source_session_id")
    .execute();

  const machine = await conn
    .selectFrom("coach_report_dimension_scores")
    .innerJoin(
      "coach_intake_sessions",
      "coach_intake_sessions.report_id",
      "coach_report_dimension_scores.report_id",
    )
    .select([
      "coach_report_dimension_scores.report_id as report_id",
      "coach_report_dimension_scores.dimension_n as dimension_n",
      "coach_report_dimension_scores.machine_score as machine_score",
    ])
    .where("coach_intake_sessions.parallel_run", "=", true)
    .where("coach_intake_sessions.coach_id", "is not", null)
    .execute();
  const machineByReport = new Map<string, Map<number, number | null>>();
  for (const m of machine) {
    const scores = machineByReport.get(m.report_id) ?? new Map();
    scores.set(m.dimension_n, m.machine_score);
    machineByReport.set(m.report_id, scores);
  }

  const since = backendRows[0]?.date;
  const hostRows = since
    ? await conn
        .selectFrom("coach_reports")
        .select(["id as reportId", "coach_id as coachId", "summary", "metrics"])
        .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
        .where("source_session_id", "like", "legacy:%")
        .where("session_date", ">=", sql<Date>`${since}::date`)
        .orderBy("session_date")
        .orderBy("source_session_id")
        .execute()
    : [];

  type Backend = (typeof backendRows)[number];
  type Host = (typeof hostRows)[number];
  const groups = new Map<
    string,
    { coachId: string; date: string; backend: Backend[]; host: Host[] }
  >();
  const group = (coachId: string, date: string) => {
    const key = `${coachId}\u0000${date}`;
    const found = groups.get(key) ?? { coachId, date, backend: [], host: [] };
    groups.set(key, found);
    return found;
  };
  for (const b of backendRows)
    group(b.coachId as string, b.date).backend.push(b);
  for (const h of hostRows) group(h.coachId, h.date).host.push(h);

  const out: ParallelRunComparison = {
    sessions: [],
    needsPairing: [],
    unmatched: { backend: [], host: [] },
    share: { withinOne: 0, comparable: 0, ratio: null },
    counts: {
      compared: 0,
      flagged: 0,
      needsPairing: 0,
      unmatchedBackend: 0,
      unmatchedHost: 0,
    },
  };

  const ordered = [...groups.values()].sort((a, b) =>
    a.date === b.date
      ? a.coachId.localeCompare(b.coachId)
      : a.date.localeCompare(b.date),
  );
  for (const g of ordered) {
    const { coachId, date } = g;
    if (g.backend.length > 1 || g.host.length > 1) {
      out.needsPairing.push({
        coachId,
        date,
        backend: g.backend.map((b) => ({
          sourceSessionId: b.sourceSessionId,
          reportId: b.reportId,
        })),
        host: g.host.map((h) => ({ reportId: h.reportId })),
      });
      continue;
    }
    const [b] = g.backend;
    const [h] = g.host;
    if (!h) {
      out.unmatched.backend.push({
        coachId,
        date,
        sourceSessionId: b.sourceSessionId,
        reportId: b.reportId,
      });
      continue;
    }
    if (!b) {
      out.unmatched.host.push({ coachId, date, reportId: h.reportId });
      continue;
    }
    const scores = machineByReport.get(b.reportId) ?? new Map();
    const bonuses = (b.metrics ?? {}) as Record<string, unknown>;
    const backendComposite = composeComposite(composeBaseScore(scores).base, {
      newcomerBonus: Number(bonuses.newcomerBonus ?? 0),
      sizeBonus: Number(bonuses.sizeBonus ?? 0),
    });
    const hostComposite = scoreOrNull(
      (h.summary as { score?: unknown })?.score,
    );
    const compared = compareScores(
      { composite: hostComposite, dimensions: hostDimensions(h.metrics) },
      {
        composite: backendComposite,
        dimensions: DIMENSIONS.map((d) => scores.get(d.n) ?? null),
      },
    );
    out.sessions.push({
      coachId,
      date,
      backend: {
        sourceSessionId: b.sourceSessionId,
        reportId: b.reportId,
        composite: backendComposite,
      },
      host: { reportId: h.reportId, composite: hostComposite },
      ...compared,
    });
  }

  out.share.withinOne = out.sessions.reduce((n, s) => n + s.withinOne, 0);
  out.share.comparable = out.sessions.reduce((n, s) => n + s.comparable, 0);
  out.share.ratio =
    out.share.comparable > 0
      ? out.share.withinOne / out.share.comparable
      : null;
  out.counts = {
    compared: out.sessions.length,
    flagged: out.sessions.filter((s) => s.flagged).length,
    needsPairing: out.needsPairing.length,
    unmatchedBackend: out.unmatched.backend.length,
    unmatchedHost: out.unmatched.host.length,
  };
  return out;
}
