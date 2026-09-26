import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db as Database } from "database";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import {
  type HandScoredReport,
  calibrationShortfalls,
  replayOrder,
  selectEligible,
} from "./coach-calibration";
import {
  handScoredCorpus,
  readTranscript,
  runCalibration,
} from "./coach-calibration.runner";
import { CoachScoringService } from "./coach-scoring.service";
import coachDataJson from "./coach.data.json";
import { RUBRIC_MODEL_VERSION } from "./rubric";

const conn = Database.getOrCreateConnection();
const corpus = handScoredCorpus();
const byId = new Map(corpus.map((r) => [r.reportId, r]));

class HandCopyAi implements AiProvider {
  readonly name = "fake";
  calls = 0;
  scored: string[] = [];
  constructor(private readonly skew = 0) {}
  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    this.calls += 1;
    const text = opts.messages.map((m) => m.content).join("\n");
    const id = /REPORT:(\S+)/.exec(text)?.[1] ?? "";
    this.scored.push(id);
    const hand = byId.get(id) as HandScoredReport;
    return {
      content: JSON.stringify({
        dimensions: hand.dimensions
          .filter((d) => d.n !== 7)
          .map((d) => ({
            n: d.n,
            score:
              d.score === null
                ? null
                : Math.min(5, Math.max(1, d.score - this.skew)),
            rationale: `reason for ${d.n}`,
          })),
      }),
      model: "fake",
    };
  }
  private no(name: string): never {
    throw new Error(`HandCopyAi.${name} is not part of calibration`);
  }
  responsesCreate = () => this.no("responsesCreate");
  filesCreate = () => this.no("filesCreate");
  filesRetrieve = () => this.no("filesRetrieve");
  filesContent = () => this.no("filesContent");
  batchesCreate = () => this.no("batchesCreate");
  batchesRetrieve = () => this.no("batchesRetrieve");
  batchesCancel = () => this.no("batchesCancel");
}

function transcriptsFor(reports: HandScoredReport[]): string {
  const dir = mkdtempSync(join(tmpdir(), "coach-calibration-run-"));
  for (const r of reports) {
    writeFileSync(
      join(dir, `${r.reportId}.txt`),
      `LEADER: REPORT:${r.reportId}`,
    );
  }
  return dir;
}

const everyTranscript = transcriptsFor(corpus);
const noTranscripts = mkdtempSync(join(tmpdir(), "coach-calibration-none-"));

function deps(ai: HandCopyAi, transcriptsDir = everyTranscript) {
  return {
    db: Database,
    scoring: new CoachScoringService(Database, ai),
    transcriptsDir,
  };
}

async function runsFor(version: string) {
  const row = await conn
    .selectFrom("coach_calibration_runs")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("model_version", "=", version)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

async function modelScoredReport(id: string) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: "calib-runner-coach",
      session_date: "2026-09-01",
      source_session_id: `ff-${id}`,
      legacy_ids: [],
      summary: {},
      metrics: {},
      body: {},
    })
    .execute();
  await conn
    .insertInto("coach_report_dimension_scores")
    .values({
      report_id: id,
      dimension_n: 1,
      score: 4,
      rationale: "r",
      provenance: "machine",
      model_version: RUBRIC_MODEL_VERSION,
    })
    .execute();
}

let lastRunBefore = 0;

beforeEach(async () => {
  const row = await conn
    .selectFrom("coach_calibration_runs")
    .select((eb) => eb.fn.max("id").as("id"))
    .executeTakeFirst();
  lastRunBefore = Number(row?.id ?? 0);
});

afterEach(async () => {
  await conn
    .deleteFrom("coach_calibration_runs")
    .where("id", ">", lastRunBefore)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", "calib-runner-coach")
    .execute();
});

describe("the calibration runner measures the bundle's own hand-scored corpus", () => {
  it("states the corpus, the filter and what it excluded, all derived from the bundle", async () => {
    const bundle = coachDataJson as unknown as {
      coaches: Array<{ reports: unknown[] }>;
    };
    const result = await runCalibration(deps(new HandCopyAi()), {
      dryRun: true,
      limit: 4,
    });
    expect(result.corpusReports).toBe(
      bundle.coaches.reduce((n, c) => n + c.reports.length, 0),
    );
    expect(result.corpusLeaders).toBe(bundle.coaches.length);
    const expected = selectEligible(corpus);
    expect(result.eligible).toBe(expected.eligible.length);
    expect(result.excluded).toEqual(expected.excluded);
    expect(result.emptyRationaleEntries).toBe(expected.emptyRationaleEntries);
    expect(result.totalDimensionEntries).toBe(expected.totalDimensionEntries);
    expect(result.totalDimensionEntries).toBeGreaterThan(0);
    expect(result.excluded.length).toBeGreaterThan(0);
  });

  it("a dry run scores and measures but records nothing", async () => {
    const before = await runsFor(RUBRIC_MODEL_VERSION);
    const result = await runCalibration(deps(new HandCopyAi()), {
      dryRun: true,
      limit: 4,
    });
    expect(result.report.overall.reports).toBe(4);
    expect(result.recordedRunId).toBeNull();
    expect(result.notRecordedBecause).toBe("dry run");
    expect(await runsFor(RUBRIC_MODEL_VERSION)).toBe(before);
  });

  it("the limit caps model calls and spreads across leaders, each in date order", async () => {
    const ai = new HandCopyAi();
    const leaders = replayOrder(selectEligible(corpus).eligible);
    const limit = leaders.size + 2;
    await runCalibration(deps(ai), { dryRun: true, limit });

    const asked = ai.scored.map((id) => byId.get(id) as HandScoredReport);
    expect(asked.length).toBe(limit);
    expect(ai.calls).toBe(limit);
    expect(new Set(asked.map((r) => r.coachId)).size).toBe(leaders.size);
    for (const [coach, reports] of leaders) {
      const mine = asked.filter((r) => r.coachId === coach);
      expect(mine).toEqual(reports.slice(0, mine.length));
    }
  });

  it("a real run records the agreement under the model version it ran, and the delivery gate reads it", async () => {
    const result = await runCalibration(deps(new HandCopyAi()), {
      dryRun: false,
      limit: 6,
    });
    expect(result.modelVersion).toBe(RUBRIC_MODEL_VERSION);
    expect(result.verdict.withinTolerance).toBe(true);
    expect(result.recordedRunId).not.toBeNull();
    expect(result.report.perLeader.size).toBeGreaterThan(1);

    await modelScoredReport("calib-runner-r1");
    expect(await calibrationShortfalls(Database, "calib-runner-r1")).toEqual(
      [],
    );
  });

  it("a model that disagrees is recorded as outside tolerance, and the gate holds its reports", async () => {
    const result = await runCalibration(deps(new HandCopyAi(2)), {
      dryRun: false,
      limit: 6,
    });
    expect(result.verdict.withinTolerance).toBe(false);

    await modelScoredReport("calib-runner-r2");
    expect(
      (await calibrationShortfalls(Database, "calib-runner-r2")).length,
    ).toBeGreaterThan(0);
  });

  it("reports with no transcript are counted, and nothing is recorded when nothing was scored", async () => {
    const before = await runsFor(RUBRIC_MODEL_VERSION);
    const ai = new HandCopyAi();
    const result = await runCalibration(deps(ai, noTranscripts), {
      dryRun: false,
      limit: 3,
    });
    expect(ai.calls).toBe(0);
    expect(result.unscored.map((u) => u.reason)).toEqual([
      "no-transcript",
      "no-transcript",
      "no-transcript",
    ]);
    expect(result.recordedRunId).toBeNull();
    expect(await runsFor(RUBRIC_MODEL_VERSION)).toBe(before);
  });
});

describe("transcripts come from a directory the operator points at", () => {
  const outside = mkdtempSync(join(tmpdir(), "coach-calibration-"));
  const dir = join(outside, "transcripts");
  mkdirSync(dir);
  writeFileSync(join(outside, "secret.txt"), "LEADER: not a transcript");

  it("reads our pseudonymised JSON, bare or as a retained transcript file", async () => {
    writeFileSync(
      join(dir, "r-json.json"),
      JSON.stringify({
        sentences: [
          { speakerId: "speaker-1", isLeader: true, text: "welcome" },
          { speakerId: "speaker-2", isLeader: false, text: "hi" },
        ],
      }),
    );
    const lines = readTranscript(dir, "r-json");
    expect(lines).toEqual([
      { speakerId: "speaker-1", isLeader: true, text: "welcome" },
      { speakerId: "speaker-2", isLeader: false, text: "hi" },
    ]);
  });

  it("reads plain text with a speaker label per line, LEADER marking the leader", async () => {
    writeFileSync(
      join(dir, "r-text.txt"),
      "LEADER: welcome everyone\n\nspeaker-2: glad to be here\n",
    );
    expect(readTranscript(dir, "r-text")).toEqual([
      { speakerId: "leader", isLeader: true, text: "welcome everyone" },
      { speakerId: "speaker-2", isLeader: false, text: "glad to be here" },
    ]);
  });

  it("a report with no file, or an id that tries to leave the directory, has no transcript", async () => {
    expect(readTranscript(dir, "missing")).toBeNull();
    expect(readTranscript(dir, "../secret")).toBeNull();
  });
});

describe("the runner is an operator step, never automatic", () => {
  it("no module outside tests imports it, so nothing runs it on boot or on a tick", async () => {
    const root = new URL("..", import.meta.url).pathname;
    const importers: string[] = [];
    for (const file of new Bun.Glob("**/*.ts").scanSync(root)) {
      if (
        file.endsWith(".test.ts") ||
        file.endsWith("coach-calibration.runner.ts")
      )
        continue;
      const source = await Bun.file(`${root}${file}`).text();
      if (source.includes("coach-calibration.runner")) importers.push(file);
    }
    expect(importers).toEqual([]);
  });
});
