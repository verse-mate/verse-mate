import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import type {
  AiChatBatch,
  AiChatBatchRequest,
  AiChatOptions,
  AiChatResponse,
  AiProvider,
} from "../shared/ai";
import { COACH_SCORING_BATCH, coachScoringBatch } from "./coach-models";
import {
  CoachPipelineService,
  PIPELINE_BATCH_LIMIT,
} from "./coach-pipeline.service";
import {
  bodyAnswer,
  bodySentences,
  isBodyCall,
} from "./coach-report-body.fixture";
import { CoachScoringService, promptVersion } from "./coach-scoring.service";
import { isolateTable } from "./coach-test-tables";
import type {
  FirefliesDetailClient,
  FirefliesTranscript,
  FirefliesTranscriptDetail,
} from "./fireflies.client";
import { DIMENSIONS } from "./rubric";

const conn = Database.getOrCreateConnection();
isolateTable("coach_dataset_meta");

const COACH = "batch-coach";
const EMAIL = "batch-leader@example.test";
const MODEL = "astra-test";

function textAnswer(score: number): string {
  return JSON.stringify({
    dimensions: DIMENSIONS.filter((d) => d.n !== 7).map((d) => ({
      n: d.n,
      score,
      rationale: `a genuine reason for dimension ${d.n} at 12:${String(d.n).padStart(2, "0")}`,
    })),
  });
}

const visionAnswer = JSON.stringify({
  score: 5,
  rationale: "slides and a map on screen",
  attendees: 9,
});

type Answer = AiChatResponse | { error: string };

class BatchAi implements AiProvider {
  readonly name = "batch-fake";
  chats: AiChatOptions[] = [];
  submitted: Array<{
    requests: AiChatBatchRequest[];
    metadata: Record<string, string>;
  }> = [];
  outcome: (metadata: Record<string, string>) => AiChatBatch = (metadata) => ({
    status: "pending",
    metadata,
  });

  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    this.chats.push(opts);
    if (isBodyCall(opts)) return { content: bodyAnswer(), model: "fake" };
    if (opts.messages.some((m) => m.images?.length))
      return { content: visionAnswer, model: "direct" };
    return { content: textAnswer(4), model: "direct" };
  }
  async submitChatBatch(
    requests: AiChatBatchRequest[],
    metadata: Record<string, string>,
  ): Promise<string> {
    this.submitted.push({ requests, metadata });
    return `batch-${this.submitted.length}`;
  }
  async collectChatBatch(batchId: string): Promise<AiChatBatch> {
    const known = this.submitted[Number(batchId.split("-")[1]) - 1];
    return this.outcome(
      known?.metadata ?? {
        coach_session: batchId.replace("seeded-", ""),
        prompt_version: promptVersion(),
        model: MODEL,
      },
    );
  }
  scoringChats(): AiChatOptions[] {
    return this.chats.filter((c) => !isBodyCall(c));
  }
  private no(name: string): never {
    throw new Error(`BatchAi.${name} is not part of the pipeline`);
  }
  responsesCreate = () => this.no("responsesCreate");
  filesCreate = () => this.no("filesCreate");
  filesRetrieve = () => this.no("filesRetrieve");
  filesContent = () => this.no("filesContent");
  batchesCreate = () => this.no("batchesCreate");
  batchesRetrieve = () => this.no("batchesRetrieve");
  batchesCancel = () => this.no("batchesCancel");
}

function completed(text: Answer, vision: Answer) {
  return (metadata: Record<string, string>): AiChatBatch => ({
    status: "completed",
    metadata,
    results: { text, vision },
  });
}

class CountingClient implements FirefliesDetailClient {
  reads = 0;
  async listTranscripts(): Promise<FirefliesTranscript[]> {
    return [];
  }
  async getTranscript(): Promise<FirefliesTranscriptDetail | null> {
    this.reads += 1;
    return {
      id: "ff-batch-1",
      title: "Obadiah, Lesson 4",
      host_email: "fred@fireflies.ai",
      organizer_email: "fred@fireflies.ai",
      dateString: "2026-08-22T14:00:00.000Z",
      duration: 62,
      audio_url: null,
      video_url: "https://cdn.fireflies.ai/rec/abc.mp4",
      transcript_url: null,
      sentences: bodySentences(),
    };
  }
}

const oneFrame = {
  extract: async () => [{ data: new Uint8Array([1]), index: 0 }],
};
const noFrames = {
  extract: async () => {
    throw new Error("the recording is not in storage");
  },
};

function pipeline(
  ai: AiProvider,
  client = new CountingClient(),
  frames: object = oneFrame,
) {
  return new CoachPipelineService(Database, client, null, {
    scoring: new CoachScoringService(Database, ai, MODEL),
    frames: frames as never,
  });
}

async function seed(id: string, batchId: string | null = null) {
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: id,
      coach_id: COACH,
      matched_by: "title_match",
      title: "Obadiah, Lesson 4",
      session_date: "2026-08-22",
      state: "retained",
      scoring_batch_id: batchId,
    })
    .execute();
}

async function row(id = "ff-batch-1") {
  return conn
    .selectFrom("coach_intake_sessions")
    .select(["state", "retry_count", "scoring_batch_id", "report_id"])
    .where("source_session_id", "=", id)
    .executeTakeFirstOrThrow();
}

async function storedScores(id = "ff-batch-1") {
  return conn
    .selectFrom("coach_report_dimension_scores")
    .innerJoin(
      "coach_intake_sessions",
      "coach_intake_sessions.report_id",
      "coach_report_dimension_scores.report_id",
    )
    .select([
      "coach_report_dimension_scores.dimension_n as n",
      "coach_report_dimension_scores.score as score",
      "coach_report_dimension_scores.language_model as model",
    ])
    .where("coach_intake_sessions.source_session_id", "=", id)
    .orderBy("coach_report_dimension_scores.dimension_n")
    .execute();
}

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "like", "ff-batch-%")
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
  await conn.deleteFrom("coach_leaders").where("email", "=", EMAIL).execute();
}

const savedSetting = process.env[COACH_SCORING_BATCH];

beforeEach(async () => {
  delete process.env[COACH_SCORING_BATCH];
  await clear();
  await conn
    .insertInto("coach_leaders")
    .values({ slug: COACH, email: EMAIL, name: "Batch Leader" })
    .execute();
});
afterEach(async () => {
  if (savedSetting === undefined) delete process.env[COACH_SCORING_BATCH];
  else process.env[COACH_SCORING_BATCH] = savedSetting;
  await clear();
});

describe("coach scoring goes through the batch API", () => {
  it("the setting is on unless it says false", () => {
    for (const [value, on] of [
      [undefined, true],
      ["", true],
      ["true", true],
      [" FALSE ", false],
      ["false", false],
    ] as const) {
      if (value === undefined) delete process.env[COACH_SCORING_BATCH];
      else process.env[COACH_SCORING_BATCH] = value;
      expect(coachScoringBatch()).toBe(on);
    }
  });

  it("a session with frames goes out as one batch holding the text and the vision request, and waits for it: no direct call, nothing published, no attempt counted", async () => {
    await seed("ff-batch-1");
    const ai = new BatchAi();

    const [result] = await pipeline(ai).run();

    expect(result.outcome).toBe("scoring-in-batch");
    expect(ai.scoringChats()).toEqual([]);
    expect(ai.submitted).toHaveLength(1);
    const { requests, metadata } = ai.submitted[0];
    expect(requests.map((r) => r.id)).toEqual(["text", "vision"]);
    expect(requests.every((r) => r.options.model === MODEL)).toBe(true);
    expect(requests[0].options.messages.some((m) => m.images?.length)).toBe(
      false,
    );
    expect(requests[1].options.messages.some((m) => m.images?.length)).toBe(
      true,
    );
    expect(metadata).toEqual({
      coach_session: "ff-batch-1",
      prompt_version: promptVersion(),
      model: MODEL,
    });
    expect(await row()).toEqual({
      state: "retained",
      retry_count: 0,
      scoring_batch_id: "batch-1",
      report_id: null,
    });
  });

  it("a batch still running is looked at again on the next tick without reading the transcript, a new batch or a model call, and does not take a new session's place", async () => {
    for (let i = 0; i < PIPELINE_BATCH_LIMIT; i++)
      await seed(`ff-batch-wait-${i}`, `seeded-ff-batch-wait-${i}`);
    await seed("ff-batch-new");
    const ai = new BatchAi();
    const client = new CountingClient();

    const results = await pipeline(ai, client).run();

    expect(
      results.filter((r) => r.sourceSessionId.startsWith("ff-batch-wait-")),
    ).toHaveLength(PIPELINE_BATCH_LIMIT);
    expect(results.every((r) => r.outcome === "scoring-in-batch")).toBe(true);
    expect(ai.submitted.map((s) => s.metadata.coach_session)).toEqual([
      "ff-batch-new",
    ]);
    expect(client.reads).toBe(1);
    expect(ai.scoringChats()).toEqual([]);
    expect((await row("ff-batch-wait-0")).scoring_batch_id).toBe(
      "seeded-ff-batch-wait-0",
    );
  });

  it("a finished batch is scored from its answers and published as a direct call's would be, and the batch is forgotten", async () => {
    await seed("ff-batch-1");
    const ai = new BatchAi();
    await pipeline(ai).run();
    ai.outcome = completed(
      { content: textAnswer(3), model: "astra-served" },
      { content: visionAnswer, model: "astra-served-vision" },
    );

    const [result] = await pipeline(ai).run();

    expect(result.outcome).toBe("scored-awaiting-review");
    expect(ai.scoringChats()).toEqual([]);
    expect(ai.submitted).toHaveLength(1);
    const after = await row();
    expect(after.state).toBe("scored");
    expect(after.scoring_batch_id).toBeNull();
    const scores = await storedScores();
    expect(scores).toHaveLength(DIMENSIONS.length);
    for (const s of scores) {
      expect(s.score).toBe(s.n === 7 ? 5 : 3);
      expect(s.model).toBe(s.n === 7 ? "astra-served-vision" : "astra-served");
    }
    const report = await conn
      .selectFrom("coach_reports")
      .select("summary")
      .where("id", "=", after.report_id as string)
      .executeTakeFirstOrThrow();
    expect(report.summary).toMatchObject({ attendees: 9 });
  });

  it("a batch that failed or expired is a failed attempt, and the next tick sends a new batch", async () => {
    await seed("ff-batch-1");
    const ai = new BatchAi();
    await pipeline(ai).run();
    ai.outcome = (metadata) => ({
      status: "failed",
      metadata,
      detail: "expired",
    });

    const [failed] = await pipeline(ai).run();

    expect(failed.outcome).toBe("scoring-failed");
    expect(failed.detail).toContain("expired");
    expect(await row()).toMatchObject({
      state: "retained",
      retry_count: 1,
      scoring_batch_id: null,
    });

    ai.outcome = (metadata) => ({ status: "pending", metadata });
    const [again] = await pipeline(ai).run();
    expect(again.outcome).toBe("scoring-in-batch");
    expect(ai.submitted).toHaveLength(2);
    expect((await row()).scoring_batch_id).toBe("batch-2");
  });

  it("a text answer the batch could not give is a failed attempt", async () => {
    await seed("ff-batch-1");
    const ai = new BatchAi();
    await pipeline(ai).run();
    ai.outcome = completed(
      { error: "the response did not complete: max_output_tokens" },
      { content: visionAnswer, model: "v" },
    );

    const [result] = await pipeline(ai).run();

    expect(result.outcome).toBe("scoring-failed");
    expect(result.detail).toContain("max_output_tokens");
    expect(await row()).toMatchObject({
      retry_count: 1,
      scoring_batch_id: null,
    });
  });

  it("a vision answer the batch could not give is retried like a vision error, never published as Visual Aids not applicable", async () => {
    await seed("ff-batch-1");
    const ai = new BatchAi();
    await pipeline(ai).run();
    ai.outcome = completed(
      { content: textAnswer(4), model: "t" },
      { error: "image too large" },
    );

    const [result] = await pipeline(ai).run();

    expect(result.outcome).toBe("scoring-failed");
    expect(result.detail).toContain("the vision model could not be reached");
    expect(await row()).toMatchObject({
      report_id: null,
      retry_count: 1,
      scoring_batch_id: null,
    });
  });

  it("a batch sent under another prompt or model is set aside, and the session goes out in a new batch without counting an attempt", async () => {
    await seed("ff-batch-1");
    const ai = new BatchAi();
    await pipeline(ai).run();
    ai.outcome = (metadata) =>
      completed(
        { content: textAnswer(3), model: "old" },
        { content: visionAnswer, model: "old" },
      )({ ...metadata, prompt_version: "an-older-prompt" });

    const [result] = await pipeline(ai).run();

    expect(result.outcome).toBe("scoring-in-batch");
    expect(ai.submitted).toHaveLength(2);
    expect(await row()).toMatchObject({
      retry_count: 0,
      scoring_batch_id: "batch-2",
      report_id: null,
    });
  });

  it("with the setting false, scoring calls the model directly", async () => {
    process.env[COACH_SCORING_BATCH] = "false";
    await seed("ff-batch-1");
    const ai = new BatchAi();

    const [result] = await pipeline(ai).run();

    expect(result.outcome).toBe("scored-awaiting-review");
    expect(ai.submitted).toEqual([]);
    expect(ai.scoringChats()).toHaveLength(2);
    expect((await row()).scoring_batch_id).toBeNull();
  });

  it("frames that could not be taken keep the direct path, so the last attempt still holds the report for Visual Aids", async () => {
    await seed("ff-batch-1");
    await conn
      .updateTable("coach_intake_sessions")
      .set({ retry_count: 4 })
      .where("source_session_id", "=", "ff-batch-1")
      .execute();
    const ai = new BatchAi();

    const [result] = await pipeline(ai, new CountingClient(), noFrames).run();

    expect(result.outcome).toBe("scored-awaiting-review");
    expect(result.detail).toContain("Visual Aids not observed");
    expect(ai.submitted).toEqual([]);
    expect(ai.scoringChats()).toHaveLength(1);
  });

  it("a provider that cannot batch scores directly", async () => {
    await seed("ff-batch-1");
    const ai = new BatchAi();
    const direct = Object.assign(Object.create(ai), {
      submitChatBatch: undefined,
      collectChatBatch: undefined,
    }) as AiProvider;

    const [result] = await pipeline(direct).run();

    expect(result.outcome).toBe("scored-awaiting-review");
    expect(ai.submitted).toEqual([]);
    expect(ai.scoringChats()).toHaveLength(2);
  });
});
