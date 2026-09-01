import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import { CoachScoringService } from "./coach-scoring.service";
import { DIMENSIONS, RUBRIC_MODEL_VERSION } from "./rubric";

const conn = Database.getOrCreateConnection();
const COACH = "scoring-coach";
const REPORT = "scoring-report";

/** Answers with whatever the test decides the model said. */
class FakeAi implements AiProvider {
  readonly name = "fake";
  lastPrompt = "";
  constructor(private readonly payload: string) {}
  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    this.lastPrompt = opts.messages.map((m) => m.content).join("\n");
    return { content: this.payload, model: "fake" };
  }
  /**
   * The rest of the provider surface. Throwing beats `as any` stubs: if a
   * future change makes scoring reach for one of these, the test says so
   * instead of quietly returning an empty object.
   */
  private unused(name: string): never {
    throw new Error(`FakeAi.${name} is not part of scoring`);
  }
  responsesCreate = () => this.unused("responsesCreate");
  filesCreate = () => this.unused("filesCreate");
  filesRetrieve = () => this.unused("filesRetrieve");
  filesContent = () => this.unused("filesContent");
  batchesCreate = () => this.unused("batchesCreate");
  batchesRetrieve = () => this.unused("batchesRetrieve");
  batchesCancel = () => this.unused("batchesCancel");
}

function payload(
  entries: Array<{ n: number; score: number | null; rationale?: string }>,
): string {
  return JSON.stringify({
    dimensions: entries.map((e) => ({
      n: e.n,
      score: e.score,
      rationale: e.rationale ?? `a genuine reason for dimension ${e.n}`,
    })),
  });
}

const ALL_FOURS = payload(DIMENSIONS.map((d) => ({ n: d.n, score: 4 })));

const INPUT = {
  reportId: REPORT,
  sessionTitle: "Obadiah — Saturday Morning",
  transcript: [
    { speakerId: "speaker-1", isLeader: true, text: "welcome everyone" },
    { speakerId: "speaker-2", isLeader: false, text: "glad to be here" },
  ],
};

async function seedReport() {
  await conn
    .insertInto("coach_reports")
    .values({
      id: REPORT,
      coach_id: COACH,
      session_date: "2026-08-22",
      source_session_id: "ff-scoring",
      legacy_ids: [],
      summary: {},
      metrics: {},
      body: {},
    })
    .execute();
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

async function storedScores() {
  return conn
    .selectFrom("coach_report_dimension_scores")
    .selectAll()
    .where("report_id", "=", REPORT)
    .orderBy("dimension_n")
    .execute();
}

describe("a session is scored without an operator present", () => {
  beforeEach(async () => {
    await clear();
    await seedReport();
  });
  afterEach(clear);

  it("the model judges; CODE does every piece of arithmetic", async () => {
    const ai = new FakeAi(ALL_FOURS);
    const result = await new CoachScoringService(Database, ai).scoreSession(
      INPUT,
    );

    expect(result.ok).toBe(true);
    // Eleven 4s with dimension 7 not-applicable (no frames): every cluster is
    // still at 80%, because a not-applicable dimension leaves the denominator
    // smaller rather than counting as zero. Computed here from the rubric.
    expect(result.base).toBeCloseTo(80, 6);
    expect(result.status?.label).toBe("Strong");
    // The model is told NOT to compute a total; asking it to would produce a
    // number nobody can reconstruct.
    expect(ai.lastPrompt).toMatch(/Do not compute a total/);
  });

  it("the prompt is built FROM the rubric, so a weight change reaches the model", async () => {
    const ai = new FakeAi(ALL_FOURS);
    await new CoachScoringService(Database, ai).scoreSession(INPUT);
    for (const d of DIMENSIONS) {
      expect(ai.lastPrompt).toContain(d.name);
      expect(ai.lastPrompt).toContain(d.target);
    }
    expect(ai.lastPrompt).toContain("Teaching Craft (33 points)");
  });

  it("records every dimension with its provenance and the model version", async () => {
    const ai = new FakeAi(ALL_FOURS);
    await new CoachScoringService(Database, ai).scoreSession(INPUT);

    const rows = await storedScores();
    expect(rows.length).toBe(12);
    expect(rows.every((r) => r.provenance === "machine")).toBe(true);
    expect(rows.every((r) => r.model_version === RUBRIC_MODEL_VERSION)).toBe(
      true,
    );
    expect(rows.every((r) => r.rationale.length > 0)).toBe(true);
  });

  it("a re-score PRESERVES an admin's correction and refreshes the rest", async () => {
    const ai = new FakeAi(ALL_FOURS);
    const svc = new CoachScoringService(Database, ai);
    await svc.scoreSession(INPUT);

    // An admin corrects dimension 1.
    await conn
      .updateTable("coach_report_dimension_scores")
      .set({ score: 2, rationale: "admin says otherwise", provenance: "human" })
      .where("report_id", "=", REPORT)
      .where("dimension_n", "=", 1)
      .execute();

    // Re-score, with the model now saying 5 everywhere.
    const fives = payload(DIMENSIONS.map((d) => ({ n: d.n, score: 5 })));
    await new CoachScoringService(Database, new FakeAi(fives)).scoreSession(
      INPUT,
    );

    const rows = await storedScores();
    const corrected = rows.find((r) => r.dimension_n === 1);
    expect(corrected?.score).toBe(2);
    expect(corrected?.provenance).toBe("human");
    expect(corrected?.rationale).toBe("admin says otherwise");
    // …while every machine dimension moved to the new run. Dimension 7 is
    // excluded: with no frames supplied it is not-applicable by design, not
    // scored from the text (task 5.4).
    expect(
      rows
        .filter((r) => r.dimension_n !== 1 && r.dimension_n !== 7)
        .every((r) => r.score === 5),
    ).toBe(true);
  });

  it("a dimension the session gives no evidence for is stored as NULL, not low", async () => {
    const withNa = payload([
      ...DIMENSIONS.filter((d) => d.n !== 2).map((d) => ({ n: d.n, score: 4 })),
      { n: 2, score: null, rationale: "no newcomers were present" },
    ]);
    const result = await new CoachScoringService(
      Database,
      new FakeAi(withNa),
    ).scoreSession(INPUT);

    expect(result.ok).toBe(true);
    const rows = await storedScores();
    expect(rows.find((r) => r.dimension_n === 2)?.score).toBeNull();
    // Building Ministry is scored over its two remaining dimensions and can
    // still reach its full weight.
    const bm = result.clusters?.find((c) => c.name === "Building Ministry");
    expect(bm?.scorePct).toBeCloseTo(80, 6);
  });

  it("an out-of-range score is REJECTED, and nothing is stored", async () => {
    const bad = payload([
      ...DIMENSIONS.filter((d) => d.n !== 1).map((d) => ({ n: d.n, score: 4 })),
      { n: 1, score: 9 },
    ]);
    const result = await new CoachScoringService(
      Database,
      new FakeAi(bad),
    ).scoreSession(INPUT);

    expect(result.ok).toBe(false);
    expect(result.failure).toBe("model-output-rejected");
    expect((await storedScores()).length).toBe(0);
  });

  it("an OMITTED dimension fails the run — silence is not not-applicable", async () => {
    // Treating an omission as 'not observable' shrinks the cluster denominator
    // and inflates the composite: the leader is rewarded for the model's gap.
    const partial = payload(
      DIMENSIONS.filter((d) => d.n <= 6).map((d) => ({ n: d.n, score: 4 })),
    );
    const result = await new CoachScoringService(
      Database,
      new FakeAi(partial),
    ).scoreSession(INPUT);

    expect(result.ok).toBe(false);
    expect(result.failure).toBe("model-omitted-dimensions");
    // 7 is NOT among them — the vision path always supplies it (task 5.4).
    expect(result.detail).toContain("8");
    expect(result.detail).not.toMatch(/\b7\b/);
    expect((await storedScores()).length).toBe(0);
  });

  it("unparseable model output fails cleanly rather than throwing", async () => {
    const result = await new CoachScoringService(
      Database,
      new FakeAi("not json at all"),
    ).scoreSession(INPUT);
    expect(result.ok).toBe(false);
    expect(result.failure).toBe("model-returned-unparseable-output");
  });

  it("with FRAMES, dimension 7 is judged from the picture", async () => {
    // The one dimension the transcript cannot answer: charts, slides, maps and
    // word-study tools appear only in the picture.
    class VisionAi extends FakeAi {
      sawImages = 0;
      override async chatComplete(
        opts: AiChatOptions,
      ): Promise<AiChatResponse> {
        const withImages = opts.messages.find((m) => m.images?.length);
        if (withImages) {
          this.sawImages = withImages.images?.length ?? 0;
          return {
            content: JSON.stringify({
              score: 5,
              rationale: "slides and a map were on screen throughout",
            }),
            model: "fake",
          };
        }
        return super.chatComplete(opts);
      }
    }
    const ai = new VisionAi(ALL_FOURS);
    const result = await new CoachScoringService(Database, ai).scoreSession({
      ...INPUT,
      frames: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])],
    });

    expect(result.ok).toBe(true);
    expect(ai.sawImages).toBe(2);
    const rows = await storedScores();
    expect(rows.find((r) => r.dimension_n === 7)?.score).toBe(5);
  });

  it("WITHOUT frames, dimension 7 is not-applicable — never scored low", async () => {
    // Scoring low on missing evidence would be a false claim about the leader,
    // made systematically on every session whose video could not be sampled.
    const ai = new FakeAi(ALL_FOURS);
    await new CoachScoringService(Database, ai).scoreSession(INPUT);
    const rows = await storedScores();
    const visual = rows.find((r) => r.dimension_n === 7);
    expect(visual?.score).toBeNull();
    expect(visual?.rationale).toContain("could not be observed");
  });

  it("a vision call returning nonsense does not fail the whole session", async () => {
    class BrokenVision extends FakeAi {
      override async chatComplete(
        opts: AiChatOptions,
      ): Promise<AiChatResponse> {
        if (opts.messages.some((m) => m.images?.length)) {
          return { content: "<html>gateway error</html>", model: "fake" };
        }
        return super.chatComplete(opts);
      }
    }
    const result = await new CoachScoringService(
      Database,
      new BrokenVision(ALL_FOURS),
    ).scoreSession({ ...INPUT, frames: [new Uint8Array([1])] });

    // Eleven dimensions are still legitimately scored.
    expect(result.ok).toBe(true);
    const rows = await storedScores();
    expect(rows.find((r) => r.dimension_n === 7)?.score).toBeNull();
  });

  it("the transcript reaches the model pseudonymously", async () => {
    const ai = new FakeAi(ALL_FOURS);
    await new CoachScoringService(Database, ai).scoreSession(INPUT);
    expect(ai.lastPrompt).toContain("LEADER: welcome everyone");
    expect(ai.lastPrompt).toContain("speaker-2: glad to be here");
  });
});
