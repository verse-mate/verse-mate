import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

import type { db } from "../shared/shared.plugin";
import {
  type Agreement,
  type CalibrationReport,
  type HandScoredReport,
  type MachineScoring,
  type ToleranceVerdict,
  checkTolerance,
  measureAgreement,
  recordCalibration,
  replayOrder,
  selectEligible,
} from "./coach-calibration";
import type {
  CoachScoringService,
  ScoringInput,
} from "./coach-scoring.service";
import coachDataJson from "./coach.data.json";

export type TranscriptLine = ScoringInput["transcript"][number];

export interface CalibrationTranscriptSource {
  transcriptFor(report: HandScoredReport): Promise<TranscriptLine[] | null>;
}

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
  report: CalibrationReport;
  verdict: ToleranceVerdict;
  recordedRunId: number | null;
  notRecordedBecause: string | null;
}

export class DirectoryTranscriptSource implements CalibrationTranscriptSource {
  constructor(private readonly dir: string) {}

  async transcriptFor(
    report: HandScoredReport,
  ): Promise<TranscriptLine[] | null> {
    if (basename(report.reportId) !== report.reportId) return null;
    const json = join(this.dir, `${report.reportId}.json`);
    if (existsSync(json))
      return parseJsonTranscript(readFileSync(json, "utf8"));
    const text = join(this.dir, `${report.reportId}.txt`);
    if (existsSync(text))
      return parseTextTranscript(readFileSync(text, "utf8"));
    return null;
  }
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
    transcripts: CalibrationTranscriptSource;
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
    const transcript = await deps.transcripts.transcriptFor(hand);
    if (!transcript || transcript.length === 0) {
      unscored.push({ ...ids(hand), reason: "no-transcript" });
      continue;
    }
    const scored = await deps.scoring.scoreSession({
      transcript,
      sessionTitle: "",
      frames: [],
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
  const verdict = checkTolerance(report.overall);

  let recordedRunId: number | null = null;
  let notRecordedBecause: string | null = null;
  if (options.dryRun) {
    notRecordedBecause = "dry run";
  } else if (report.overall.reports === 0 || !modelVersion) {
    notRecordedBecause =
      "no report was scored, so there is no agreement to record";
  } else {
    recordedRunId = await recordCalibration(
      deps.db,
      modelVersion,
      report.overall,
    );
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
    report,
    verdict,
    recordedRunId,
    notRecordedBecause,
  };
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
      ([coach, a]) => `  ${coach}: ${describeAgreement(a)}`,
    ),
    result.verdict.withinTolerance
      ? "Verdict: within tolerance"
      : `Verdict: OUTSIDE tolerance: ${result.verdict.shortfalls.join("; ")}`,
    "Limits: Visual Aids is not compared (no frames for historical sessions); Authenticity is scored per session, without the rolling baseline.",
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
      transcripts: new DirectoryTranscriptSource(values.transcripts),
    },
    { limit, dryRun: values["dry-run"] === true },
  );
  console.log(formatCalibration(result));
  process.exit(result.verdict.withinTolerance ? 0 : 1);
}
