import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db as Database } from "database";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import {
  type HandScoredReport,
  replayOrder,
  selectEligible,
} from "./coach-calibration";
import {
  formatCalibration,
  handScoredCorpus,
  readTranscript,
  runCalibration,
} from "./coach-calibration.runner";
import { CoachScoringService } from "./coach-scoring.service";
import { datasetToRows } from "./coach-store.transform";
import coachDataJson from "./coach.data.json";
import { DIMENSIONS, RUBRIC_MODEL_VERSION } from "./rubric";

const conn = Database.getOrCreateConnection();

const seeded: string[] = [];
for (const row of datasetToRows(coachDataJson)) {
  const inserted = await conn
    .insertInto("coach_reports")
    .values({
      id: row.id,
      coach_id: row.coach_id,
      session_date: row.session_date,
      source_session_id: row.source_session_id,
      legacy_ids: row.legacy_ids,
      summary: JSON.stringify(row.summary),
      metrics: JSON.stringify(row.metrics),
      body: JSON.stringify(row.body),
    })
    .onConflict((oc) => oc.column("source_session_id").doNothing())
    .returning("id")
    .executeTakeFirst();
  if (inserted) seeded.push(inserted.id);
}
afterAll(async () => {
  if (seeded.length > 0)
    await conn.deleteFrom("coach_reports").where("id", "in", seeded).execute();
});

const corpus = await handScoredCorpus(Database);
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
  it("states the corpus, the filter and what it excluded, all derived from the store", async () => {
    const result = await runCalibration(deps(new HandCopyAi()), {
      dryRun: true,
      limit: 4,
    });
    expect(result.corpusReports).toBe(corpus.length);
    expect(result.corpusLeaders).toBe(
      new Set(corpus.map((r) => r.coachId)).size,
    );
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

  it("a real run records the agreement under the model version it ran", async () => {
    const result = await runCalibration(deps(new HandCopyAi()), {
      dryRun: false,
    });
    expect(result.modelVersion).toBe(RUBRIC_MODEL_VERSION);
    expect(result.verdict.withinTolerance).toBe(true);
    expect(result.recordedRunId).not.toBeNull();
    expect(result.report.perLeader.size).toBeGreaterThan(1);
    const [singleReportLeader] =
      [...result.report.perLeader].find(([, a]) => a.reports === 1) ?? [];
    expect(singleReportLeader).toBeDefined();
    expect(result.verdict.ungated).toContain(singleReportLeader);
    const printed = formatCalibration(result);
    expect(printed).toContain(
      "Measured but not gated, fewer than 3 reports compared:",
    );
    expect(printed).toContain(
      `${singleReportLeader}: 1 reports, composite MAE`,
    );
    expect(printed).toMatch(
      new RegExp(`${singleReportLeader}: .*\\(measured, not gated\\)`),
    );
  });

  it("a model that disagrees is recorded as outside tolerance", async () => {
    const result = await runCalibration(deps(new HandCopyAi(2)), {
      dryRun: false,
      limit: 6,
    });
    expect(result.verdict.withinTolerance).toBe(false);
  });

  it("one favourable report does not unblock the programme", async () => {
    const result = await runCalibration(deps(new HandCopyAi()), {
      dryRun: false,
      limit: 1,
    });
    expect(result.report.overall.reports).toBe(1);
    expect(result.verdict.withinTolerance).toBe(false);
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

describe("the hand-scored corpus is read from the store, not the bundle task 7.1 deletes", () => {
  const COACH = "calib-store-coach";
  afterEach(async () => {
    await conn
      .deleteFrom("coach_reports")
      .where("coach_id", "=", COACH)
      .execute();
  });

  async function insert(id: string, source: string) {
    await conn
      .insertInto("coach_reports")
      .values({
        id,
        coach_id: COACH,
        session_date: "2026-05-01",
        source_session_id: source,
        legacy_ids: [],
        summary: {},
        metrics: JSON.stringify({
          dimensions: [
            { n: 1, score: 4, note: "held the room" },
            { n: 2, score: null, note: "" },
          ],
        }),
        body: {},
      })
      .execute();
  }

  it("a backfilled report is in the corpus with its hand scores and rationales", async () => {
    await insert("calib-store-legacy", `legacy:${COACH}:2026-05-01`);
    const stored = await handScoredCorpus(Database);
    expect(stored.find((r) => r.reportId === "calib-store-legacy")).toEqual({
      coachId: COACH,
      reportId: "calib-store-legacy",
      date: "2026-05-01",
      dimensions: [
        { n: 1, score: 4, rationale: "held the room" },
        { n: 2, score: null, rationale: "" },
      ],
    });
  });

  it("a report the pipeline produced is not hand-scored and stays out", async () => {
    await insert("calib-store-machine", "ff-calib-store-machine");
    const stored = await handScoredCorpus(Database);
    expect(stored.some((r) => r.reportId === "calib-store-machine")).toBe(
      false,
    );
  });

  it("the runner measures the stored corpus when none is passed", async () => {
    await insert("calib-store-legacy", `legacy:${COACH}:2026-05-01`);
    const result = await runCalibration(
      {
        db: Database,
        scoring: new CoachScoringService(Database, new HandCopyAi()),
        transcriptsDir: noTranscripts,
      },
      { dryRun: true, limit: 1 },
    );
    expect(result.corpusReports).toBe(
      (await handScoredCorpus(Database)).length,
    );
    expect(result.corpusLeaders).toBe(
      new Set((await handScoredCorpus(Database)).map((r) => r.coachId)).size,
    );
  });

  it("the runner does not import the bundle", async () => {
    const source = await Bun.file(
      new URL("./coach-calibration.runner.ts", import.meta.url).pathname,
    ).text();
    expect(source).not.toContain("coach.data.json");
  });
});

describe("the runner is an operator step, never automatic", () => {
  it("no module outside tests imports it, so nothing runs it on boot or on a tick", async () => {
    const root = new URL("..", import.meta.url).pathname;
    const importers: string[] = [];
    for (const file of new Bun.Glob("**/*.ts").scanSync(root)) {
      if (
        file.endsWith(".test.ts") ||
        file.endsWith("coach-calibration.runner.ts") ||
        file.endsWith("coach-calibration.claude-cli.ts")
      )
        continue;
      const source = await Bun.file(`${root}${file}`).text();
      if (source.includes("coach-calibration.runner")) importers.push(file);
    }
    expect(importers).toEqual([]);
  });
});

describe("the backtest replays each leader's history, so authenticity has its baseline", () => {
  it("each session is scored against the rounded mean of the leader's earlier hand scores, the first against none", async () => {
    const history = (reportId: string, date: string, authenticity: number) => ({
      coachId: "calib-replay-leader",
      reportId,
      date,
      dimensions: DIMENSIONS.map((d) => ({
        n: d.n,
        score: d.n === 8 ? authenticity : 3,
        rationale: "r",
      })),
    });
    const leaderCorpus = [
      history("calib-replay-3", "2026-03-01", 4),
      history("calib-replay-1", "2026-01-01", 2),
      history("calib-replay-2", "2026-02-01", 4),
    ];
    const dir = mkdtempSync(join(tmpdir(), "coach-calibration-replay-"));
    for (const r of leaderCorpus) {
      writeFileSync(
        join(dir, `${r.reportId}.txt`),
        `LEADER: REPORT:${r.reportId}`,
      );
      byId.set(r.reportId, r);
    }
    const scoring = new CoachScoringService(Database, new HandCopyAi());
    const baselines: Array<number | null | undefined> = [];
    await runCalibration(
      {
        db: Database,
        corpus: leaderCorpus,
        transcriptsDir: dir,
        scoring: {
          scoreSession: (input) => {
            baselines.push(input.authenticityBaseline);
            return scoring.scoreSession(input);
          },
        },
      },
      { dryRun: true },
    );
    expect(baselines).toEqual([null, 2, 3]);
  });

  it("states the dimension-8 agreement floor the cap imposes, derived from the corpus", async () => {
    const scored = (reportId: string, date: string, authenticity: number) => ({
      coachId: "calib-floor-leader",
      reportId,
      date,
      dimensions: DIMENSIONS.map((d) => ({
        n: d.n,
        score: d.n === 8 ? authenticity : 3,
        rationale: "r",
      })),
    });
    const result = await runCalibration(
      {
        ...deps(new HandCopyAi(), noTranscripts),
        corpus: [
          scored("calib-floor-1", "2026-01-01", 3),
          scored("calib-floor-2", "2026-02-01", 3),
          scored("calib-floor-3", "2026-03-01", 5),
          scored("calib-floor-4", "2026-04-01", 4),
        ],
      },
      { dryRun: true },
    );
    expect(result.authenticityFloor).toEqual({
      unreachable: 1,
      transitions: 3,
    });
    expect(formatCalibration(result)).toContain(
      "1 of 3 hand-scored authenticity transitions",
    );
  });
});
