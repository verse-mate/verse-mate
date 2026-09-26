import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { db as Database } from "database";
import { sql } from "kysely";

import { rowToReport } from "./coach-store.transform";
import { ReportSchema } from "./coach.schema";
import { CoachService } from "./coach.service";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import { recordCalibration } from "./coach-calibration";
import {
  CoachPipelineService,
  PIPELINE_ATTEMPT_LIMIT,
  PIPELINE_BATCH_LIMIT,
  evidenceFrom,
} from "./coach-pipeline.service";
import { CoachScoringService } from "./coach-scoring.service";
import type {
  FirefliesDetailClient,
  FirefliesTranscript,
  FirefliesTranscriptDetail,
} from "./fireflies.client";
import { DIMENSIONS, RUBRIC_MODEL_VERSION } from "./rubric";

const conn = Database.getOrCreateConnection();
const COACH = "pipe-coach";
const EMAIL = "pipe-leader@example.test";

/**
 * The join the change was missing.
 *
 * Every stage below was already built and tested on its own, and the worker ran
 * intake and retrieval and then stopped, so scoring, publishing, delivery and
 * frame extraction were unreachable code. Recordings were retrieved, stored and
 * paid for and no report was ever produced. This is the test that would have
 * caught it: it asserts a retained session reaches a delivered report.
 */

class FakeAi implements AiProvider {
  readonly name = "fake";
  constructor(private readonly perDimension = 4) {}
  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    if (opts.messages.some((m) => m.images?.length)) {
      return {
        content: JSON.stringify({
          score: this.perDimension,
          rationale: "one map on screen throughout the session",
        }),
        model: "fake",
      };
    }
    return {
      content: JSON.stringify({
        dimensions: DIMENSIONS.filter((d) => d.n !== 7).map((d) => ({
          n: d.n,
          score: this.perDimension,
          rationale: `a genuine reason for dimension ${d.n} at 12:${String(d.n).padStart(2, "0")}`,
        })),
      }),
      model: "fake",
    };
  }
  private no(name: string): never {
    throw new Error(`FakeAi.${name} is not part of the pipeline`);
  }
  responsesCreate = () => this.no("responsesCreate");
  filesCreate = () => this.no("filesCreate");
  filesRetrieve = () => this.no("filesRetrieve");
  filesContent = () => this.no("filesContent");
  batchesCreate = () => this.no("batchesCreate");
  batchesRetrieve = () => this.no("batchesRetrieve");
  batchesCancel = () => this.no("batchesCancel");
}

class CountingAi extends FakeAi {
  calls = 0;
  override async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    this.calls += 1;
    return super.chatComplete(opts);
  }
}

class FakeClient implements FirefliesDetailClient {
  async listTranscripts(): Promise<FirefliesTranscript[]> {
    return [];
  }
  async getTranscript(): Promise<FirefliesTranscriptDetail | null> {
    return {
      id: "ff-pipe-1",
      title: "Obadiah, Lesson 4",
      host_email: "fred@fireflies.ai",
      organizer_email: "fred@fireflies.ai",
      dateString: "2026-08-22T14:00:00.000Z",
      duration: 62,
      audio_url: null,
      video_url: "https://cdn.fireflies.ai/rec/abc.mp4",
      transcript_url: null,
      participantCount: 9,
      summary: { overview: "ok" },
      sentences: [
        {
          index: 0,
          speakerId: "speaker-1",
          isLeader: true,
          text: "welcome",
          start_time: 0,
          end_time: 1,
        },
      ],
    };
  }
}

class FakeMailer {
  sent: string[] = [];
  constructor(private readonly ok = true) {}
  async sendEmail(data: { to: { email: string } }) {
    this.sent.push(data.to.email);
    return this.ok ? { delivered: true } : { delivered: false, error: "no" };
  }
}

/** No ffmpeg, no bucket. */
const noFrames = { extract: async () => [] };

function pipeline(mailer: FakeMailer | null, ai = new FakeAi()) {
  return new CoachPipelineService(Database, new FakeClient(), mailer as any, {
    scoring: new CoachScoringService(Database, ai),
    frames: noFrames as any,
  });
}

async function seedRetained(id = "ff-pipe-1") {
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: id,
      coach_id: COACH,
      matched_by: "title_match",
      title: "Obadiah, Lesson 4",
      session_date: "2026-08-22",
      state: "retained",
    })
    .execute();
}

async function clear() {
  // Scoped by SESSION ID, not by coach_id: one test below sets coach_id to
  // null to exercise the unattributed path, and a coach-scoped delete left
  // that row behind to collide with the next test's insert. Cleanup has to key
  // on something the tests do not mutate.
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "like", "ff-pipe-%")
    .execute();
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "like", "ff-extra-%")
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
  await conn.deleteFrom("coach_leaders").where("email", "=", EMAIL).execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

async function priorReport(
  id: string,
  date: string,
  authenticity: number,
  corrected?: number,
) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: COACH,
      session_date: date,
      source_session_id: `ff-pipe-prior-${id}`,
      legacy_ids: [],
      summary: {},
      metrics: JSON.stringify({
        dimensions: [
          { n: 1, score: 3, note: "r" },
          { n: 8, score: authenticity, note: "r" },
        ],
      }),
      body: {},
    })
    .execute();
  if (corrected !== undefined) {
    await conn
      .insertInto("coach_report_dimension_scores")
      .values({
        report_id: id,
        dimension_n: 8,
        score: corrected,
        rationale: "corrected",
        provenance: "human",
        model_version: RUBRIC_MODEL_VERSION,
      })
      .execute();
  }
}

async function storedAuthenticity() {
  return conn
    .selectFrom("coach_report_dimension_scores")
    .innerJoin(
      "coach_intake_sessions",
      "coach_intake_sessions.report_id",
      "coach_report_dimension_scores.report_id",
    )
    .select([
      "coach_report_dimension_scores.score",
      "coach_report_dimension_scores.rationale",
    ])
    .where("coach_intake_sessions.source_session_id", "=", "ff-pipe-1")
    .where("coach_report_dimension_scores.dimension_n", "=", 8)
    .executeTakeFirstOrThrow();
}

let calibrationRun: number | null = null;

async function calibrate() {
  calibrationRun = await recordCalibration(Database, RUBRIC_MODEL_VERSION, {
    compositeMae: 2,
    dimensionsWithinOne: 0.95,
    comparisons: 120,
    reports: 10,
  });
}

async function uncalibrate() {
  if (calibrationRun === null) return;
  await conn
    .deleteFrom("coach_calibration_runs")
    .where("id", "=", calibrationRun)
    .execute();
  calibrationRun = null;
}

describe("a retained session reaches a delivered report", () => {
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: COACH, email: EMAIL, name: "Pipe Leader" })
      .execute();
    await seedRetained();
    await calibrate();
  });
  afterEach(async () => {
    await clear();
    await uncalibrate();
  });

  it("an uncalibrated scoring model publishes the report but does not send it", async () => {
    await uncalibrate();
    const mailer = new FakeMailer();
    const [result] = await pipeline(mailer).run();
    expect(result.outcome).toBe("delivery-blocked");
    expect(result.detail).toContain(RUBRIC_MODEL_VERSION);
    expect(result.reportId).toBeTruthy();
    expect(mailer.sent).toEqual([]);
  });

  it("scores it, publishes it, and emails it, in that order", async () => {
    const mailer = new FakeMailer();
    const [result] = await pipeline(mailer).run();

    expect(result.outcome).toBe("scored-and-delivered");
    expect(result.reportId).toBeTruthy();
    expect(mailer.sent.length).toBeGreaterThan(0);
  });

  it("the report is live and carries the composite CODE computed", async () => {
    await pipeline(new FakeMailer()).run();
    const report = await conn
      .selectFrom("coach_reports")
      .select(["id", "summary"])
      .where("coach_id", "=", COACH)
      .executeTakeFirstOrThrow();
    // Eleven 4s with dimension 7 at 3 from the vision stub.
    expect((report.summary as { score: number }).score).toBeGreaterThan(70);
  });

  it("the report it publishes SATISFIES the API's own response schema", async () => {
    // Found by running the pipeline end to end against a real database and a
    // real portal: the report published fine, and then `GET /coach/reports`
    // answered 422 for every one of the leader's sessions, because the list is
    // validated as a whole and this report's `feedback` was `{}`. The leader's
    // dashboard read "Something went wrong loading your coaching data" and
    // showed nothing at all. One malformed report hides an entire history.
    await pipeline(new FakeMailer()).run();
    const row = await conn
      .selectFrom("coach_reports")
      .select(["id", "summary", "metrics", "body"])
      .select(
        sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("session_date"),
      )
      .where("coach_id", "=", COACH)
      .executeTakeFirstOrThrow();

    const report = rowToReport({
      id: row.id,
      session_date: row.session_date,
      summary: row.summary as Record<string, unknown>,
      metrics: row.metrics as Record<string, unknown>,
      body: row.body as Record<string, unknown>,
    });
    const errors = [...Value.Errors(ReportSchema, report)].map(
      (e) => `${e.path}: ${e.message}`,
    );
    expect(errors).toEqual([]);
    expect(Value.Check(ReportSchema, report)).toBe(true);
  });

  it("every dimension is persisted INTO the published report", async () => {
    // The ordering problem this class exists to solve: the dimension scores'
    // foreign key needs the report row, and publishing needs the composite.
    await pipeline(new FakeMailer()).run();
    const report = await conn
      .selectFrom("coach_reports")
      .select("id")
      .where("coach_id", "=", COACH)
      .executeTakeFirstOrThrow();
    const rows = await conn
      .selectFrom("coach_report_dimension_scores")
      .select(["dimension_n", "provenance"])
      .where("report_id", "=", report.id)
      .execute();
    expect(rows.length).toBe(12);
    expect(rows.every((r) => r.provenance === "machine")).toBe(true);
  });

  it("the session ends up marked delivered", async () => {
    await pipeline(new FakeMailer()).run();
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("source_session_id", "=", "ff-pipe-1")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("delivered");
  });

  it("a uniform maximum waits for a human instead of reaching the leader", async () => {
    // Frames supplied, so dimension 7 is scored rather than not-applicable —
    // otherwise the set is never actually uniform.
    const mailer = new FakeMailer();
    const withFrames = {
      extract: async () => [{ data: new Uint8Array([1]), index: 0 }],
    };
    const svc = new CoachPipelineService(
      Database,
      new FakeClient(),
      mailer as any,
      {
        scoring: new CoachScoringService(Database, new FakeAi(5)),
        frames: withFrames as any,
      },
    );
    const [result] = await svc.run();
    expect(result.outcome).toBe("scored-awaiting-review");
    expect(mailer.sent).toEqual([]);
    // …but the report still exists, for the admin review path.
    expect(result.reportId).toBeTruthy();
  });

  it("a coerced maximum on the routine frameless path still waits for a human", async () => {
    const mailer = new FakeMailer();
    const [result] = await pipeline(mailer, new FakeAi(5)).run();
    expect(result.outcome).toBe("scored-awaiting-review");
    expect(mailer.sent).toEqual([]);
  });

  it("an admin releases a report held for review, and it is delivered", async () => {
    const [held] = await pipeline(new FakeMailer(), new FakeAi(5)).run();
    expect(held.outcome).toBe("scored-awaiting-review");
    const mailer = new FakeMailer();
    const result = await new CoachService(
      Database,
      mailer as any,
    ).releaseHeldReport(held.reportId as string);
    expect(result.delivered).toBe(true);
    expect(mailer.sent.length).toBeGreaterThan(0);
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("source_session_id", "=", "ff-pipe-1")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("delivered");
  });

  it("a released report still meets governance, and a violation keeps it held", async () => {
    const [held] = await pipeline(new FakeMailer(), new FakeAi(5)).run();
    await conn
      .updateTable("coach_reports")
      .set({
        body: JSON.stringify({
          bigIdeas: [],
          feedback: { headline: "Not yet at Bryan Bailey's level" },
        }),
      })
      .where("id", "=", held.reportId as string)
      .execute();
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: "pipe-bench",
        email: "pipe-bench@example.test",
        name: "Bryan Bailey",
        is_benchmark: true,
      })
      .onConflict((oc) => oc.column("slug").doNothing())
      .execute();
    const mailer = new FakeMailer();
    try {
      const result = await new CoachService(
        Database,
        mailer as any,
      ).releaseHeldReport(held.reportId as string);
      expect(result.delivered).toBe(false);
      expect(result.refusal).toBe("governance-blocked");
      expect(mailer.sent).toEqual([]);
      const row = await conn
        .selectFrom("coach_intake_sessions")
        .select("state")
        .where("source_session_id", "=", "ff-pipe-1")
        .executeTakeFirstOrThrow();
      expect(row.state).toBe("scored");
    } finally {
      await conn
        .deleteFrom("coach_leaders")
        .where("slug", "=", "pipe-bench")
        .execute();
    }
  });

  it("a released report still waits for calibration", async () => {
    const [held] = await pipeline(new FakeMailer(), new FakeAi(5)).run();
    await uncalibrate();
    const mailer = new FakeMailer();
    const result = await new CoachService(
      Database,
      mailer as any,
    ).releaseHeldReport(held.reportId as string);
    expect(result.refusal).toBe("calibration-blocked");
    expect(mailer.sent).toEqual([]);
  });

  it("only a report held for review can be released", async () => {
    const [delivered] = await pipeline(new FakeMailer()).run();
    expect(delivered.outcome).toBe("scored-and-delivered");
    const mailer = new FakeMailer();
    const service = new CoachService(Database, mailer as any);
    expect(
      (await service.releaseHeldReport(delivered.reportId as string)).refusal,
    ).toBe("not-held");
    expect((await service.releaseHeldReport("no-such-report")).refusal).toBe(
      "not-held",
    );
    expect(mailer.sent).toEqual([]);
  });

  it("with no mailer configured a release is refused rather than claimed sent", async () => {
    const [held] = await pipeline(new FakeMailer(), new FakeAi(5)).run();
    const result = await new CoachService(Database).releaseHeldReport(
      held.reportId as string,
    );
    expect(result).toEqual({ delivered: false, refusal: "no-mailer" });
  });

  it("the pipeline scores authenticity against the leader's most recent prior session", async () => {
    await priorReport("prior-json-only", "2026-08-15", 2);
    await pipeline(new FakeMailer()).run();
    expect(await storedAuthenticity()).toMatchObject({ score: 3 });
    expect((await storedAuthenticity()).rationale).toContain("held at 3");
  });

  it("the baseline is the rounded mean of every prior session, so one dip does not move it", async () => {
    await priorReport("prior-a", "2026-07-01", 5);
    await priorReport("prior-b", "2026-07-15", 5);
    await priorReport("prior-dip", "2026-08-15", 2);
    await pipeline(new FakeMailer()).run();
    expect(await storedAuthenticity()).toMatchObject({ score: 4 });
    expect((await storedAuthenticity()).rationale).not.toContain("held at");
  });

  it("a human correction to the prior session is the baseline, not the machine's first answer", async () => {
    await priorReport("prior-corrected", "2026-08-15", 2, 4);
    await pipeline(new FakeMailer()).run();
    expect(await storedAuthenticity()).toMatchObject({ score: 4 });
  });

  it("a later session is not a baseline for an earlier one", async () => {
    await priorReport("later-session", "2026-09-30", 1);
    await pipeline(new FakeMailer()).run();
    expect(await storedAuthenticity()).toMatchObject({ score: 4 });
  });

  it("with NO mailer the report is still published, and nothing is claimed sent", async () => {
    const [result] = await pipeline(null).run();
    expect(result.outcome).toBe("scored-awaiting-review");
    expect(result.reportId).toBeTruthy();
  });

  it("a failed send stays retryable, and a later tick delivers it without scoring it again", async () => {
    const ai = new CountingAi();
    const [result] = await pipeline(new FakeMailer(false), ai).run();
    expect(result.outcome).toBe("delivery-failed");
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("source_session_id", "=", "ff-pipe-1")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("delivery_pending");
    const scoringCalls = ai.calls;

    const mailer = new FakeMailer();
    const retried = await pipeline(mailer, ai).run();
    expect(retried.map((r) => [r.sourceSessionId, r.outcome])).toEqual([
      ["ff-pipe-1", "scored-and-delivered"],
    ]);
    expect(mailer.sent.length).toBeGreaterThan(0);
    expect(ai.calls).toBe(scoringCalls);
    const after = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("source_session_id", "=", "ff-pipe-1")
      .executeTakeFirstOrThrow();
    expect(after.state).toBe("delivered");
  });

  it("delivery attempts are counted from zero, not on top of earlier scoring failures", async () => {
    await conn
      .updateTable("coach_intake_sessions")
      .set({ retry_count: PIPELINE_ATTEMPT_LIMIT - 1 })
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();
    await pipeline(new FakeMailer(false)).run();
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["state", "retry_count"])
      .where("source_session_id", "=", "ff-pipe-1")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ state: "delivery_pending", retry_count: 1 });
  });

  it("the redelivery carries the evidence the report cited, so rule 2 still sees it", async () => {
    await pipeline(new FakeMailer(false)).run();
    await pipeline(new FakeMailer()).run();
    const report = await conn
      .selectFrom("coach_reports")
      .select("evidence")
      .where("coach_id", "=", COACH)
      .executeTakeFirstOrThrow();
    expect(
      (report.evidence as { timestamps: string[] }).timestamps.length,
    ).toBeGreaterThan(0);
  });

  it("a session left mid-delivery by a crashed worker is picked up again once the claim is stale", async () => {
    await pipeline(new FakeMailer(false)).run();
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivering", updated_at: sql`NOW() - interval '1 day'` })
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();
    const results = await pipeline(new FakeMailer()).run();
    expect(results.map((r) => [r.sourceSessionId, r.outcome])).toEqual([
      ["ff-pipe-1", "scored-and-delivered"],
    ]);
  });

  it("a session that exhausted its delivery attempts is listed for an admin and no longer retried", async () => {
    await pipeline(new FakeMailer(false)).run();
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivery_failed" })
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();
    const mailer = new FakeMailer();
    expect(await pipeline(mailer).run()).toEqual([]);
    expect(mailer.sent).toEqual([]);

    const failures = await new CoachService(Database).listPipelineFailures();
    expect(
      failures.find((f) => f.sourceSessionId === "ff-pipe-1"),
    ).toMatchObject({ coachId: COACH, state: "delivery_failed" });
  });

  it("a session that is not retained yet is left alone", async () => {
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "held" })
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();
    expect(await pipeline(new FakeMailer()).run()).toEqual([]);
  });

  it("an UNATTRIBUTED session is not scored, there is nobody to send it to", async () => {
    await conn
      .updateTable("coach_intake_sessions")
      .set({ coach_id: null, matched_by: "unresolved" })
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();
    expect(await pipeline(new FakeMailer()).run()).toEqual([]);
  });

  it("one tick has a bounded budget, each session costs model calls", async () => {
    for (let i = 0; i < PIPELINE_BATCH_LIMIT + 3; i += 1) {
      await conn
        .insertInto("coach_intake_sessions")
        .values({
          source_session_id: `ff-extra-${i}`,
          coach_id: COACH,
          matched_by: "title_match",
          title: "Obadiah, Lesson 4",
          session_date: "2026-08-22",
          state: "retained",
        })
        .onConflict((oc) => oc.column("source_session_id").doNothing())
        .execute();
    }
    const results = await pipeline(new FakeMailer()).run();
    expect(results.length).toBe(PIPELINE_BATCH_LIMIT);
  });
});

class PoisonClient implements FirefliesDetailClient {
  private readonly healthy = new FakeClient();
  async listTranscripts(): Promise<FirefliesTranscript[]> {
    return [];
  }
  async getTranscript(id: string): Promise<FirefliesTranscriptDetail | null> {
    return id.startsWith("ff-extra-poison")
      ? null
      : this.healthy.getTranscript();
  }
}

function poisonPipeline(mailer: FakeMailer) {
  return new CoachPipelineService(Database, new PoisonClient(), mailer as any, {
    scoring: new CoachScoringService(Database, new FakeAi()),
    frames: noFrames as any,
  });
}

async function intakeRow(id: string) {
  return conn
    .selectFrom("coach_intake_sessions")
    .select(["state", "retry_count"])
    .where("source_session_id", "=", id)
    .executeTakeFirstOrThrow();
}

async function seedPoison(count: number, retryCount = 0) {
  for (let i = 0; i < count; i += 1) {
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: `ff-extra-poison-${i}`,
        coach_id: COACH,
        matched_by: "title_match",
        title: "Obadiah, Lesson 4",
        session_date: "2026-08-22",
        state: "retained",
        retry_count: retryCount,
        observed_at: sql`NOW() - interval '1 day'`,
      })
      .execute();
  }
}

describe("a session that fails scoring is counted, capped and taken out of the queue", () => {
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: COACH, email: EMAIL, name: "Pipe Leader" })
      .execute();
    await calibrate();
  });
  afterEach(async () => {
    await clear();
    await uncalibrate();
  });

  it("a failed scoring attempt is counted and the session stays queued", async () => {
    await seedPoison(1);
    const [result] = await poisonPipeline(new FakeMailer()).run();
    expect(result.outcome).toBe("scoring-failed");
    expect(await intakeRow("ff-extra-poison-0")).toEqual({
      state: "retained",
      retry_count: 1,
    });
  });

  it("the attempt that reaches the cap moves it to scoring_failed, where the queue no longer takes it", async () => {
    await seedPoison(1, PIPELINE_ATTEMPT_LIMIT - 1);
    await poisonPipeline(new FakeMailer()).run();
    expect(await intakeRow("ff-extra-poison-0")).toEqual({
      state: "scoring_failed",
      retry_count: PIPELINE_ATTEMPT_LIMIT,
    });
    expect(await poisonPipeline(new FakeMailer()).run()).toEqual([]);
  });

  it("a session capped out of scoring is listed for an admin", async () => {
    await seedPoison(1, PIPELINE_ATTEMPT_LIMIT - 1);
    await poisonPipeline(new FakeMailer()).run();
    const failures = await new CoachService(Database).listPipelineFailures();
    expect(
      failures.find((f) => f.sourceSessionId === "ff-extra-poison-0"),
    ).toMatchObject({
      coachId: COACH,
      state: "scoring_failed",
      attempts: PIPELINE_ATTEMPT_LIMIT,
    });
  });

  it("an admin re-queue puts a capped session back in the queue with a fresh budget", async () => {
    await seedPoison(1, PIPELINE_ATTEMPT_LIMIT - 1);
    await poisonPipeline(new FakeMailer()).run();
    const service = new CoachService(Database);
    expect(await service.requeuePipelineFailure("ff-extra-poison-0")).toBe(
      true,
    );
    expect(await intakeRow("ff-extra-poison-0")).toEqual({
      state: "retained",
      retry_count: 0,
    });
    const [result] = await pipeline(new FakeMailer()).run();
    expect(result).toMatchObject({
      sourceSessionId: "ff-extra-poison-0",
      outcome: "scored-and-delivered",
    });
  });

  it("a session that exhausted its delivery attempts is re-queued for delivery, not re-scored", async () => {
    await seedRetained("ff-pipe-dead");
    await pipeline(new FakeMailer(false)).run();
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivery_failed", retry_count: 5 })
      .where("source_session_id", "=", "ff-pipe-dead")
      .execute();
    expect(
      await new CoachService(Database).requeuePipelineFailure("ff-pipe-dead"),
    ).toBe(true);
    expect(await intakeRow("ff-pipe-dead")).toEqual({
      state: "delivery_pending",
      retry_count: 0,
    });
    const results = await pipeline(new FakeMailer()).run();
    expect(results.map((r) => [r.sourceSessionId, r.outcome])).toEqual([
      ["ff-pipe-dead", "scored-and-delivered"],
    ]);
  });

  it("re-queue refuses a session that is not parked", async () => {
    await seedRetained("ff-pipe-live");
    expect(
      await new CoachService(Database).requeuePipelineFailure("ff-pipe-live"),
    ).toBe(false);
    expect(
      await new CoachService(Database).requeuePipelineFailure("ff-pipe-none"),
    ).toBe(false);
    expect((await intakeRow("ff-pipe-live")).state).toBe("retained");
  });

  it("a thrown scoring attempt is counted like a returned failure", async () => {
    await seedRetained("ff-pipe-throws");
    const throwing = new CoachPipelineService(
      Database,
      {
        listTranscripts: async () => [],
        getTranscript: async () => {
          throw new Error("provider exploded");
        },
      },
      new FakeMailer() as any,
      {
        scoring: new CoachScoringService(Database, new FakeAi()),
        frames: noFrames as any,
      },
    );
    const [result] = await throwing.run();
    expect(result.outcome).toBe("scoring-failed");
    expect((await intakeRow("ff-pipe-throws")).retry_count).toBe(1);
  });

  it("sessions that keep failing do not starve a new session behind them", async () => {
    await seedPoison(PIPELINE_BATCH_LIMIT);
    await poisonPipeline(new FakeMailer()).run();
    await seedRetained("ff-pipe-fresh");

    const second = await poisonPipeline(new FakeMailer()).run();
    const fresh = second.find((r) => r.sourceSessionId === "ff-pipe-fresh");
    expect(fresh?.outcome).toBe("scored-and-delivered");
  });
});

describe("the evidence rule 2 compares is built from what the model cited", () => {
  it("pulls quoted strings and timestamps out of the rationales", () => {
    const ev = evidenceFrom([
      { note: 'the leader said "let us read Obadiah slowly" at 12:04' },
      { note: "no quote here, but a stamp at 00:31:15" },
    ]);
    expect(ev.quotes).toEqual(["let us read Obadiah slowly"]);
    expect(ev.timestamps).toEqual(["12:04", "00:31:15"]);
  });

  it("de-duplicates within one report", () => {
    const ev = evidenceFrom([
      { note: 'said "the same memorable line" at 10:00' },
      { note: 'again "the same memorable line" at 10:00' },
    ]);
    expect(ev.quotes.length).toBe(1);
    expect(ev.timestamps.length).toBe(1);
  });

  it("ignores a fragment too short to be a real quote", () => {
    expect(evidenceFrom([{ note: 'he said "yes" then' }]).quotes).toEqual([]);
  });

  it("a rationale with neither yields nothing rather than throwing", () => {
    expect(evidenceFrom([{ note: "structure was clear throughout" }])).toEqual({
      quotes: [],
      timestamps: [],
    });
  });
});
