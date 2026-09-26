import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

import type { db } from "../shared/shared.plugin";
import {
  type Agreement,
  type CalibrationReport,
  type CalibrationVerdict,
  type HandScoredReport,
  MIN_GATED_LEADER_REPORTS,
  type MachineScoring,
  checkCalibration,
  measureAgreement,
  recordCalibration,
  replayOrder,
  selectEligible,
} from "./coach-calibration";
import {
  AUTHENTICITY_DIMENSION,
  AUTHENTICITY_SWING,
  type CoachScoringService,
  type ScoringInput,
  authenticityBaseline,
} from "./coach-scoring.service";
import coachDataJson from "./coach.data.json";

export type TranscriptLine = ScoringInput["transcript"][number];

export interface CalibrationRunOptions {
  limit?: number;
  dryRun: boolean;
}

export interface CalibrationRunResult {
  corpusReports: number;
  corpusLeaders: number;
  eligible: number;
  excluded: Array<{ reportId: string; coachId: string; reason: string }>;
  emptyRationaleEntries: number;
  totalDimensionEntries: number;
  sampled: number;
  unscored: Array<{ reportId: string; coachId: string; reason: string }>;
  modelVersion: string | null;
  authenticityFloor: { unreachable: number; transitions: number };
  report: CalibrationReport;
  verdict: CalibrationVerdict;
  recordedRunId: number | null;
  notRecordedBecause: string | null;
}

export function readTranscript(
  dir: string,
  reportId: string,
): TranscriptLine[] | null {
  if (basename(reportId) !== reportId) return null;
  const json = join(dir, `${reportId}.json`);
  if (existsSync(json)) return parseJsonTranscript(readFileSync(json, "utf8"));
  const text = join(dir, `${reportId}.txt`);
  if (existsSync(text)) return parseTextTranscript(readFileSync(text, "utf8"));
  return null;
}

function parseJsonTranscript(raw: string): TranscriptLine[] {
  const parsed = JSON.parse(raw) as unknown;
  const sentences = Array.isArray(parsed)
    ? parsed
    : (parsed as { sentences?: unknown[] }).sentences ?? [];
  return (sentences as Array<Partial<TranscriptLine>>)
    .filter((s) => typeof s.text === "string" && s.text.trim().length > 0)
    .map((s) => ({
      speakerId: String(s.speakerId ?? "speaker"),
      isLeader: s.isLeader === true,
      text: String(s.text).trim(),
    }));
}

function parseTextTranscript(raw: string): TranscriptLine[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = /^([^:]{1,40}):\s*(.*)$/.exec(line);
      const label = (match?.[1] ?? "unknown").trim().toLowerCase();
      return {
        speakerId: label,
        isLeader: label === "leader",
        text: (match?.[2] ?? line).trim(),
      };
    });
}

type BundleReport = {
  id: string;
  date: string;
  dimensions?: Array<{ n: number; score: number | null; note?: string }>;
};

export function handScoredCorpus(
  bundle: unknown = coachDataJson,
): HandScoredReport[] {
  const coaches = (
    bundle as { coaches: Array<{ id: string; reports: BundleReport[] }> }
  ).coaches;
  return coaches.flatMap((c) =>
    c.reports.map((r) => ({
      coachId: c.id,
      reportId: r.id,
      date: r.date,
      dimensions: (r.dimensions ?? []).map((d) => ({
        n: d.n,
        score: d.score === null ? null : Number(d.score),
        rationale: d.note ?? "",
      })),
    })),
  );
}

export function sampleAcrossLeaders(
  byLeader: Map<string, HandScoredReport[]>,
  limit?: number,
): HandScoredReport[] {
  const cap = limit ?? Number.POSITIVE_INFINITY;
  const queues = [...byLeader.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, reports]) => reports);
  const taken = new Map<HandScoredReport[], number>();
  let picked = 0;
  for (let round = 0; picked < cap; round += 1) {
    let tookAny = false;
    for (const queue of queues) {
      if (picked >= cap) break;
      if (round < queue.length) {
        taken.set(queue, round + 1);
        picked += 1;
        tookAny = true;
      }
    }
    if (!tookAny) break;
  }
  return queues.flatMap((queue) => queue.slice(0, taken.get(queue) ?? 0));
}

export async function runCalibration(
  deps: {
    db: db;
    scoring: Pick<CoachScoringService, "scoreSession">;
    transcriptsDir: string;
    corpus?: HandScoredReport[];
  },
  options: CalibrationRunOptions,
): Promise<CalibrationRunResult> {
  const corpus = deps.corpus ?? handScoredCorpus();
  const eligibility = selectEligible(corpus);
  const sample = sampleAcrossLeaders(
    replayOrder(eligibility.eligible),
    options.limit,
  );

  const unscored: CalibrationRunResult["unscored"] = [];
  const attempted: HandScoredReport[] = [];
  const machine = new Map<string, MachineScoring>();
  let modelVersion: string | null = null;

  for (const hand of sample) {
    const transcript = readTranscript(deps.transcriptsDir, hand.reportId);
    if (!transcript || transcript.length === 0) {
      unscored.push({ ...ids(hand), reason: "no-transcript" });
      continue;
    }
    const scored = await deps.scoring.scoreSession({
      transcript,
      sessionTitle: "",
      frames: [],
      authenticityBaseline: handBaseline(corpus, hand),
    });
    if (!scored.ok || !scored.dimensions) {
      unscored.push({
        ...ids(hand),
        reason: `scoring-failed: ${scored.failure ?? "unknown"}`,
      });
      continue;
    }
    modelVersion = scored.modelVersion ?? modelVersion;
    attempted.push(hand);
    machine.set(hand.reportId, {
      reportId: hand.reportId,
      dimensions: new Map(scored.dimensions.map((d) => [d.n, d.score])),
    });
  }

  const report = measureAgreement(attempted, machine);
  const verdict = checkCalibration(report);

  let recordedRunId: number | null = null;
  let notRecordedBecause: string | null = null;
  if (options.dryRun) {
    notRecordedBecause = "dry run";
  } else if (report.overall.reports === 0 || !modelVersion) {
    notRecordedBecause =
      "no report was scored, so there is no agreement to record";
  } else {
    recordedRunId = await recordCalibration(deps.db, modelVersion, report);
  }

  return {
    corpusReports: corpus.length,
    corpusLeaders: new Set(corpus.map((r) => r.coachId)).size,
    eligible: eligibility.eligible.length,
    excluded: eligibility.excluded,
    emptyRationaleEntries: eligibility.emptyRationaleEntries,
    totalDimensionEntries: eligibility.totalDimensionEntries,
    sampled: sample.length,
    unscored,
    modelVersion,
    authenticityFloor: authenticityFloor(corpus),
    report,
    verdict,
    recordedRunId,
    notRecordedBecause,
  };
}

export function authenticityFloor(corpus: HandScoredReport[]): {
  unreachable: number;
  transitions: number;
} {
  let unreachable = 0;
  let transitions = 0;
  for (const report of corpus) {
    const score = authenticityOf(report);
    const baseline = handBaseline(corpus, report);
    if (score === null || baseline === null) continue;
    transitions += 1;
    if (Math.abs(score - baseline) > AUTHENTICITY_SWING) unreachable += 1;
  }
  return { unreachable, transitions };
}

function authenticityOf(report: HandScoredReport): number | null {
  return (
    report.dimensions.find((d) => d.n === AUTHENTICITY_DIMENSION)?.score ?? null
  );
}

function handBaseline(
  corpus: HandScoredReport[],
  report: HandScoredReport,
): number | null {
  return authenticityBaseline(
    corpus
      .filter((r) => r.coachId === report.coachId && r.date < report.date)
      .map(authenticityOf),
  );
}

function ids(r: HandScoredReport) {
  return { reportId: r.reportId, coachId: r.coachId };
}

function describeAgreement(a: Agreement): string {
  return `${a.reports} reports, composite MAE ${a.compositeMae.toFixed(2)}, ${(a.dimensionsWithinOne * 100).toFixed(1)}% of ${a.comparisons} dimension comparisons within 1`;
}

export function formatCalibration(result: CalibrationRunResult): string {
  const byReason = new Map<string, number>();
  for (const e of [...result.excluded, ...result.unscored]) {
    byReason.set(e.reason, (byReason.get(e.reason) ?? 0) + 1);
  }
  const lines = [
    `Corpus: ${result.corpusReports} hand-scored reports across ${result.corpusLeaders} leaders`,
    `Eligible: ${result.eligible}; excluded before scoring: ${result.excluded.length}`,
    `Sampled for scoring: ${result.sampled}; not scored: ${result.unscored.length}`,
    ...[...byReason].map(([reason, n]) => `  ${reason}: ${n}`),
    `Empty-rationale dimension entries across the corpus: ${result.emptyRationaleEntries} of ${result.totalDimensionEntries}`,
    `Model version: ${result.modelVersion ?? "none (nothing scored)"}`,
    `Overall: ${describeAgreement(result.report.overall)}`,
    ...[...result.report.perLeader].map(
      ([coach, a]) =>
        `  ${coach}: ${describeAgreement(a)}${result.verdict.ungated.includes(coach) ? " (measured, not gated)" : ""}`,
    ),
    result.verdict.ungated.length > 0
      ? `Measured but not gated, fewer than ${MIN_GATED_LEADER_REPORTS} reports compared: ${result.verdict.ungated.join(", ")}`
      : `Every compared leader is gated (${MIN_GATED_LEADER_REPORTS} or more reports compared)`,
    result.verdict.withinTolerance
      ? "Verdict: within tolerance"
      : `Verdict: OUTSIDE tolerance: ${result.verdict.shortfalls.join("; ")}`,
    "Limits: Visual Aids is not compared (no frames for historical sessions).",
    `Authenticity floor: ${result.authenticityFloor.unreachable} of ${result.authenticityFloor.transitions} hand-scored authenticity transitions sit more than ${AUTHENTICITY_SWING} point from the rounded mean of the leader's earlier sessions. The cap makes those scores unreachable for the model, so they are a property of the rule, not a model disagreement.`,
    result.recordedRunId !== null
      ? `Recorded as calibration run ${result.recordedRunId}`
      : `Not recorded: ${result.notRecordedBecause}`,
  ];
  return lines.join("\n");
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      transcripts: { type: "string" },
      limit: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  if (!values.transcripts) {
    console.error(
      "usage: bun run coach:calibrate --transcripts <dir> [--limit <n>] [--dry-run]",
    );
    process.exit(2);
  }
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    console.error("--limit must be a positive whole number");
    process.exit(2);
  }
  const { db: Database } = await import("database");
  const { CoachScoringService } = await import("./coach-scoring.service");
  const result = await runCalibration(
    {
      db: Database,
      scoring: new CoachScoringService(Database),
      transcriptsDir: values.transcripts,
    },
    { limit, dryRun: values["dry-run"] === true },
  );
  console.log(formatCalibration(result));
  process.exit(result.verdict.withinTolerance ? 0 : 1);
}
