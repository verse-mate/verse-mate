import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { db as Database } from "database";
import { sql } from "kysely";

import { rowToReport } from "./coach-store.transform";
import { ReportSchema } from "./coach.schema";
import { CoachService } from "./coach.service";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import { reattributeSession } from "./coach-attribution";
import { recordCalibration } from "./coach-calibration";
import { COACH_PIPELINE_LIVE, coachPipelineLive } from "./coach-cutover";
import { CoachDeliveryService } from "./coach-delivery.service";
import { evidenceFrom } from "./coach-governance.service";
import {
  CoachPipelineService,
  PIPELINE_ATTEMPT_LIMIT,
  PIPELINE_BATCH_LIMIT,
} from "./coach-pipeline.service";
import { CoachScoringService } from "./coach-scoring.service";
import type {
  FirefliesDetailClient,
  FirefliesTranscript,
  FirefliesTranscriptDetail,
} from "./fireflies.client";
import {
  DIMENSIONS,
  RUBRIC_MODEL_VERSION,
  composeBaseScore,
  composeComposite,
  statusForScore,
} from "./rubric";

const conn = Database.getOrCreateConnection();

beforeAll(() => {
  process.env[COACH_PIPELINE_LIVE] = "true";
});
afterAll(() => {
  delete process.env[COACH_PIPELINE_LIVE];
});
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
  const leader = {
    compositeMae: 2,
    dimensionsWithinOne: 0.95,
    comparisons: 66,
    reports: 6,
  };
  calibrationRun = await recordCalibration(Database, RUBRIC_MODEL_VERSION, {
    overall: { ...leader, comparisons: 660, reports: 60 },
    perLeader: new Map(
      Array.from({ length: 10 }, (_, i) => [`calibrated-${i}`, leader]),
    ),
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

  it("a session that awaits release is scored and held, listed for release, and delivered only once released", async () => {
    await conn
      .updateTable("coach_intake_sessions")
      .set({ release_required: true })
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();
    const mailer = new FakeMailer();
    const [held] = await pipeline(mailer).run();
    expect(held.outcome).toBe("scored-awaiting-review");
    expect(mailer.sent).toEqual([]);
    const service = new CoachService(Database, mailer as any);
    const listed = (await service.listPipelineFailures()).sessions.find(
      (f) => f.sourceSessionId === "ff-pipe-1",
    );
    expect(listed).toMatchObject({ state: "scored", action: "release" });
    expect(listed?.reason).toContain("re-attributed");

    const redelivered = await pipeline(mailer).run();
    expect(redelivered).toEqual([]);
    expect(mailer.sent).toEqual([]);

    const released = await service.releaseHeldReport(held.reportId as string);
    expect(released.delivered).toBe(true);
    expect(mailer.sent.length).toBeGreaterThan(0);
  });

  it("a delivered session an admin re-attributes is scored again and held, not mailed", async () => {
    const OTHER = "pipe-reassigned";
    await conn
      .insertInto("coach_leaders")
      .values({ slug: OTHER, email: "pipe-reassigned@example.test", name: "R" })
      .execute();
    try {
      const [first] = await pipeline(new FakeMailer()).run();
      expect(first.outcome).toBe("scored-and-delivered");
      expect(
        await reattributeSession(Database, "ff-pipe-1", OTHER, COACH),
      ).toMatchObject({ ok: true, state: "retained" });
      const mailer = new FakeMailer();
      const [again] = await pipeline(mailer).run();
      expect(again.outcome).toBe("scored-awaiting-review");
      expect(again.detail).toContain("re-attributed");
      expect(mailer.sent).toEqual([]);
    } finally {
      await conn
        .deleteFrom("coach_reports")
        .where("coach_id", "=", OTHER)
        .execute();
      await conn
        .deleteFrom("coach_leaders")
        .where("slug", "=", OTHER)
        .execute();
    }
  });

  it("delivery refuses a session that awaits release, whoever asks", async () => {
    const [published] = await pipeline(null).run();
    await conn
      .updateTable("coach_intake_sessions")
      .set({ release_required: true, state: "delivery_pending" })
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();
    const mailer = new FakeMailer();
    const result = await new CoachDeliveryService(
      Database,
      mailer as any,
    ).deliver({
      reportId: published.reportId as string,
      evidence: { quotes: [], timestamps: [] },
    });
    expect(result.refusal).toBe("awaiting-release");
    expect(mailer.sent).toEqual([]);
  });

  it("a released report still meets governance, and a violation keeps it held", async () => {
    const [held] = await pipeline(new FakeMailer(), new FakeAi(5)).run();
    await conn
      .updateTable("coach_reports")
      .set({
        body: JSON.stringify({
          bigIdeas: [],
          feedback: { headline: "Not yet at Avery Hollis's level" },
        }),
      })
      .where("id", "=", held.reportId as string)
      .execute();
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: "pipe-bench",
        email: "pipe-bench@example.test",
        name: "Avery Hollis",
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

    const { sessions: failures } = await new CoachService(
      Database,
    ).listPipelineFailures();
    expect(
      failures.find((f) => f.sourceSessionId === "ff-pipe-1"),
    ).toMatchObject({
      coachId: COACH,
      state: "delivery_failed",
      action: "requeue",
    });
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
    const { sessions: failures } = await new CoachService(
      Database,
    ).listPipelineFailures();
    expect(
      failures.find((f) => f.sourceSessionId === "ff-extra-poison-0"),
    ).toMatchObject({
      coachId: COACH,
      state: "scoring_failed",
      attempts: PIPELINE_ATTEMPT_LIMIT,
      action: "requeue",
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

describe("a held report is not on the leader's portal until it is released", () => {
  let leaderUser = "";

  async function leaderSees(reportId: string) {
    const service = new CoachService(Database);
    const reports = (await service.getReports(leaderUser)) ?? [];
    const summaries = await service.getReportSummaries(COACH);
    const trends = await service.getTrends(leaderUser);
    const monthly = await service.getMyMonthlySummary(leaderUser, "2026-08");
    return {
      list: reports.some((r) => r.id === reportId),
      summary: summaries.items.some((r) => r.id === reportId),
      total: summaries.total,
      detail: (await service.getReportDetail(COACH, reportId)) !== null,
      trends: trends?.scoreSeries.length ?? 0,
      monthly: monthly?.summary !== null,
    };
  }

  const hidden = {
    list: false,
    summary: false,
    total: 0,
    detail: false,
    trends: 0,
    monthly: false,
  };

  async function adminSees(reportId: string) {
    const reports = await new CoachService(Database).getReportsById(COACH);
    return (reports ?? []).some((r) => r.id === reportId);
  }

  beforeEach(async () => {
    await clear();
    await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: COACH, email: EMAIL, name: "Pipe Leader" })
      .execute();
    leaderUser = (
      await conn
        .insertInto("user")
        .values({
          email: EMAIL,
          firstName: "Pipe",
          lastName: "Leader",
          emailVerified: true,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    await seedRetained();
    await calibrate();
  });
  afterEach(async () => {
    await clear();
    await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
    await uncalibrate();
  });

  it("a report the injection tripwire held is readable by the admin and by no leader read path", async () => {
    const [held] = await pipeline(new FakeMailer(), new FakeAi(5)).run();
    expect(held.outcome).toBe("scored-awaiting-review");
    const reportId = held.reportId as string;

    expect(await leaderSees(reportId)).toEqual(hidden);
    expect(await adminSees(reportId)).toBe(true);
  });

  it("releasing it puts it on the leader's portal", async () => {
    const [held] = await pipeline(new FakeMailer(), new FakeAi(5)).run();
    const reportId = held.reportId as string;
    const released = await new CoachService(
      Database,
      new FakeMailer() as any,
    ).releaseHeldReport(reportId);
    expect(released.delivered).toBe(true);

    const seen = await leaderSees(reportId);
    expect(seen.list).toBe(true);
    expect(seen.summary).toBe(true);
    expect(seen.detail).toBe(true);
    expect(seen.monthly).toBe(true);
  });

  it("a report governance blocked is held from the leader too", async () => {
    const [first] = await pipeline(new FakeMailer()).run();
    expect(first.outcome).toBe("scored-and-delivered");
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: "ff-pipe-2",
        coach_id: COACH,
        matched_by: "title_match",
        title: "Obadiah, Lesson 5",
        session_date: "2026-08-29",
        state: "retained",
      })
      .execute();

    const [second] = await pipeline(new FakeMailer()).run();
    expect(second.outcome).toBe("delivery-blocked");
    const reportId = second.reportId as string;

    const seen = await leaderSees(reportId);
    expect(seen.list).toBe(false);
    expect(seen.summary).toBe(false);
    expect(seen.total).toBe(1);
    expect(seen.detail).toBe(false);
    expect(seen.trends).toBe(1);
    expect(await adminSees(reportId)).toBe(true);
  });

  it("a report held for calibration is held from the leader too", async () => {
    await uncalibrate();
    const [blocked] = await pipeline(new FakeMailer()).run();
    expect(blocked.outcome).toBe("delivery-blocked");
    const reportId = blocked.reportId as string;

    expect(await leaderSees(reportId)).toEqual(hidden);
    expect(await adminSees(reportId)).toBe(true);
  });

  it("a tripwire hold is listed with the report id and why, and that id releases it", async () => {
    const [held] = await pipeline(new FakeMailer(), new FakeAi(5)).run();
    const service = new CoachService(Database, new FakeMailer() as any);
    const row = (await service.listPipelineFailures()).sessions.find(
      (f) => f.sourceSessionId === "ff-pipe-1",
    );
    expect(row).toMatchObject({
      state: "scored",
      reportId: held.reportId,
      action: "release",
    });
    expect(row?.reason).toContain("maximum");

    expect(
      (await service.releaseHeldReport(row?.reportId as string)).delivered,
    ).toBe(true);
    expect(
      (await service.listPipelineFailures()).sessions.some(
        (f) => f.sourceSessionId === "ff-pipe-1",
      ),
    ).toBe(false);
  });

  it("a governance block is listed with the rule it broke, as releasable", async () => {
    await pipeline(new FakeMailer()).run();
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: "ff-pipe-2",
        coach_id: COACH,
        matched_by: "title_match",
        title: "Obadiah, Lesson 5",
        session_date: "2026-08-29",
        state: "retained",
      })
      .execute();
    const [blocked] = await pipeline(new FakeMailer()).run();

    const row = (
      await new CoachService(Database).listPipelineFailures()
    ).sessions.find((f) => f.sourceSessionId === "ff-pipe-2");
    expect(row).toMatchObject({
      state: "scored",
      reportId: blocked.reportId,
      action: "release",
    });
    expect(row?.reason).toContain("governance");
  });

  it("a delivered report is not listed", async () => {
    await pipeline(new FakeMailer()).run();
    expect(
      (await new CoachService(Database).listPipelineFailures()).sessions.some(
        (f) => f.sourceSessionId === "ff-pipe-1",
      ),
    ).toBe(false);
  });

  it("with no mailer configured a clean report stays held from the leader and is listed for an admin", async () => {
    const [result] = await pipeline(null).run();
    const reportId = result.reportId as string;

    expect(await leaderSees(reportId)).toEqual(hidden);
    expect(await adminSees(reportId)).toBe(true);
    const row = (
      await new CoachService(Database).listPipelineFailures()
    ).sessions.find((f) => f.sourceSessionId === "ff-pipe-1");
    expect(row).toMatchObject({ reportId, state: "delivery_pending" });
    expect(row?.reason).toContain("no mailer");
  });

  it("with no mailer and no calibration the report never reaches the leader", async () => {
    await uncalibrate();
    const [result] = await pipeline(null).run();
    expect(await leaderSees(result.reportId as string)).toEqual(hidden);
  });

  it("once a mailer is configured the held report is delivered through the gates and reaches the leader", async () => {
    const [result] = await pipeline(null).run();
    const mailer = new FakeMailer();
    const retried = await pipeline(mailer).run();
    expect(retried.map((r) => [r.sourceSessionId, r.outcome])).toEqual([
      ["ff-pipe-1", "scored-and-delivered"],
    ]);
    expect(mailer.sent.length).toBeGreaterThan(0);
    expect((await leaderSees(result.reportId as string)).detail).toBe(true);
  });

  it("a throw between publish and delivery leaves the report held and listed", async () => {
    const svc = new CoachPipelineService(
      Database,
      new FakeClient(),
      new FakeMailer() as any,
      {
        scoring: new CoachScoringService(Database, new FakeAi()),
        frames: noFrames as any,
        delivery: {
          deliver: async () => {
            throw new Error("the governance read timed out");
          },
        } as any,
      },
    );
    await svc.run();
    const reportId = (
      await conn
        .selectFrom("coach_reports")
        .select("id")
        .where("source_session_id", "=", "ff-pipe-1")
        .executeTakeFirstOrThrow()
    ).id;
    expect(await leaderSees(reportId)).toEqual(hidden);
    expect(
      (await new CoachService(Database).listPipelineFailures()).sessions.some(
        (f) => f.reportId === reportId,
      ),
    ).toBe(true);
  });
});

describe("an admin's correction reaches the leader's report and the email", () => {
  let leaderUser = "";

  class HtmlMailer extends FakeMailer {
    html: string[] = [];
    override async sendEmail(data: { to: { email: string }; html?: string }) {
      this.html.push(data.html ?? "");
      return super.sendEmail(data);
    }
  }

  beforeEach(async () => {
    await clear();
    await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: COACH, email: EMAIL, name: "Pipe Leader" })
      .execute();
    leaderUser = (
      await conn
        .insertInto("user")
        .values({
          email: EMAIL,
          firstName: "Pipe",
          lastName: "Leader",
          emailVerified: true,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    await seedRetained();
    await calibrate();
  });
  afterEach(async () => {
    await clear();
    await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
    await uncalibrate();
  });

  it("Admin corrects a dimension: the leader's report and the email carry the corrected dimension, composite and band", async () => {
    const [scored] = await pipeline(null).run();
    const reportId = scored.reportId as string;
    const service = new CoachService(Database);
    const before = await service.getReportDetail(COACH, reportId, "admin");
    expect(before?.status).toBe("Strong");

    for (const n of [1, 3, 5]) {
      const result = await service.correctDimension({
        reportId,
        dimensionN: n,
        score: 1,
        rationale: `admin: dimension ${n} missed`,
        correctedByUserId: null,
      });
      expect(result.ok).toBe(true);
    }

    const corrected = await conn
      .selectFrom("coach_report_dimension_scores")
      .select(["dimension_n", "score"])
      .where("report_id", "=", reportId)
      .execute();
    const { base } = composeBaseScore(
      new Map(corrected.map((d) => [d.dimension_n, d.score])),
    );
    const metrics = (
      await conn
        .selectFrom("coach_reports")
        .select("metrics")
        .where("id", "=", reportId)
        .executeTakeFirstOrThrow()
    ).metrics as { newcomerBonus: number; sizeBonus: number };
    const composite = composeComposite(base, metrics);
    const band = statusForScore(composite).label;
    expect(band).not.toBe("Strong");

    const mailer = new HtmlMailer();
    const [delivered] = await pipeline(mailer).run();
    expect(delivered.outcome).toBe("scored-and-delivered");

    const seen = (await service.getReportDetail(
      COACH,
      reportId,
    )) as unknown as {
      score: number;
      status: string;
      base: number;
      dimensions: Array<{ n: number; score: number | null; note: string }>;
    };
    expect(seen.score).toBeCloseTo(composite, 6);
    expect(seen.status).toBe(band);
    expect(seen.base).toBeCloseTo(base, 6);
    expect(seen.dimensions.find((d) => d.n === 3)).toMatchObject({
      score: 1,
      note: "admin: dimension 3 missed",
    });
    const listed = (await service.getReports(leaderUser)) ?? [];
    expect(listed.find((r) => r.id === reportId)?.score).toBeCloseTo(
      composite,
      6,
    );
    expect(mailer.html.length).toBeGreaterThan(0);
    for (const html of mailer.html) {
      expect(html).toContain(band);
      expect(html).not.toContain("Strong");
    }
  });
});

describe("The Parallel Run Is Silent", () => {
  const LEGACY = "pipe-coach-2026-08-22-host-report";
  let leaderUser = "";

  beforeEach(async () => {
    await clear();
    await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: COACH, email: EMAIL, name: "Pipe Leader" })
      .execute();
    leaderUser = (
      await conn
        .insertInto("user")
        .values({
          email: EMAIL,
          firstName: "Pipe",
          lastName: "Leader",
          emailVerified: true,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    await conn
      .insertInto("coach_reports")
      .values({
        id: LEGACY,
        coach_id: COACH,
        session_date: "2026-08-22",
        source_session_id: `legacy:${COACH}:2026-08-22`,
        legacy_ids: [],
        summary: { session: "Obadiah, Lesson 4", score: 81.2 },
        metrics: {},
        body: {},
      })
      .execute();
    await seedRetained();
    await calibrate();
  });
  afterEach(async () => {
    process.env[COACH_PIPELINE_LIVE] = "true";
    await clear();
    await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
    await uncalibrate();
  });

  it("the switch is off unless it is set to true", () => {
    delete process.env[COACH_PIPELINE_LIVE];
    expect(coachPipelineLive()).toBe(false);
    process.env[COACH_PIPELINE_LIVE] = "false";
    expect(coachPipelineLive()).toBe(false);
    process.env[COACH_PIPELINE_LIVE] = " TRUE ";
    expect(coachPipelineLive()).toBe(true);
  });

  it("Both systems report one session: the leader sees the host's report once, the pipeline's is admin-only, and nothing is sent", async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    const mailer = new FakeMailer();
    const [result] = await pipeline(mailer).run();
    expect(result.outcome).toBe("scored-awaiting-review");
    expect(result.detail).toContain("parallel run");
    const reportId = result.reportId as string;
    expect(reportId).toBeTruthy();
    expect(reportId).not.toBe(LEGACY);

    const service = new CoachService(Database, mailer as any);
    const summaries = await service.getReportSummaries(COACH);
    expect(summaries.items.map((r) => r.id)).toEqual([LEGACY]);
    expect(
      ((await service.getReports(leaderUser)) ?? []).map((r) => r.id),
    ).toEqual([LEGACY]);
    expect(await service.getReportDetail(COACH, reportId)).toBeNull();
    expect(
      await service.getReportDetail(COACH, reportId, "admin"),
    ).not.toBeNull();
    expect(
      ((await service.getReportsById(COACH)) ?? []).map((r) => r.id).sort(),
    ).toEqual([LEGACY, reportId].sort());

    expect(await service.releaseHeldReport(reportId)).toMatchObject({
      delivered: false,
      refusal: "parallel-run",
    });
    await pipeline(mailer).run();
    expect(mailer.sent).toEqual([]);
    expect(await service.getReportDetail(COACH, reportId)).toBeNull();
  });

  it("Cutover switches the pipeline on: its reports are delivered and become visible", async () => {
    process.env[COACH_PIPELINE_LIVE] = "true";
    const mailer = new FakeMailer();
    const [result] = await pipeline(mailer).run();
    expect(result.outcome).toBe("scored-and-delivered");
    expect(mailer.sent.length).toBeGreaterThan(0);
    expect(
      await new CoachService(Database).getReportDetail(
        COACH,
        result.reportId as string,
      ),
    ).not.toBeNull();
  });
});

describe("a failure after scoring leaves the session somewhere a queue reads", () => {
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

  async function reportsForSession() {
    return conn
      .selectFrom("coach_reports")
      .select("id")
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();
  }

  it("a throw while persisting the dimensions publishes nothing, and the attempt is counted", async () => {
    const scoring = new CoachScoringService(Database, new FakeAi());
    scoring.persistDimensions = async () => {
      throw new Error("the database went away mid-write");
    };
    const svc = new CoachPipelineService(
      Database,
      new FakeClient(),
      new FakeMailer() as any,
      { scoring, frames: noFrames as any },
    );
    const [result] = await svc.run();

    expect(result.outcome).toBe("scoring-failed");
    expect(await reportsForSession()).toEqual([]);
    expect(await intakeRow("ff-pipe-1")).toEqual({
      state: "retained",
      retry_count: 1,
    });
  });

  it("a session re-attributed while it is being scored is not published under the old leader", async () => {
    const OTHER = "pipe-other";
    await conn
      .insertInto("coach_leaders")
      .values({ slug: OTHER, email: "pipe-other@example.test", name: "Other" })
      .execute();
    try {
      const scoring = new CoachScoringService(Database, new FakeAi());
      const score = scoring.scoreSession.bind(scoring);
      scoring.scoreSession = async (input) => {
        const scored = await score(input);
        await reattributeSession(Database, "ff-pipe-1", OTHER, COACH);
        return scored;
      };
      const mailer = new FakeMailer();
      const svc = new CoachPipelineService(
        Database,
        new FakeClient(),
        mailer as any,
        { scoring, frames: noFrames as any },
      );
      const [result] = await svc.run();

      expect(result.outcome).toBe("attribution-changed");
      expect(await reportsForSession()).toEqual([]);
      expect(mailer.sent).toEqual([]);
      expect(await intakeRow("ff-pipe-1")).toEqual({
        state: "retained",
        retry_count: 0,
      });
    } finally {
      await conn
        .deleteFrom("coach_reports")
        .where("coach_id", "=", OTHER)
        .execute();
      await conn
        .deleteFrom("coach_leaders")
        .where("slug", "=", OTHER)
        .execute();
    }
  });

  it("a session re-assigned away and back to its leader while it is scored is held for release, listed, and delivered once released", async () => {
    const OTHER = "pipe-other";
    await conn
      .insertInto("coach_leaders")
      .values({ slug: OTHER, email: "pipe-other@example.test", name: "Other" })
      .execute();
    try {
      const scoring = new CoachScoringService(Database, new FakeAi());
      const score = scoring.scoreSession.bind(scoring);
      scoring.scoreSession = async (input) => {
        const scored = await score(input);
        await reattributeSession(Database, "ff-pipe-1", OTHER, COACH);
        await reattributeSession(Database, "ff-pipe-1", COACH, OTHER);
        return scored;
      };
      const mailer = new FakeMailer();
      const [result] = await new CoachPipelineService(
        Database,
        new FakeClient(),
        mailer as any,
        { scoring, frames: noFrames as any },
      ).run();

      expect(result.outcome).toBe("scored-awaiting-review");
      expect(result.detail).toContain("re-attributed");
      expect(mailer.sent).toEqual([]);
      const row = await conn
        .selectFrom("coach_intake_sessions")
        .select(["state", "hold_reason", "release_required"])
        .where("source_session_id", "=", "ff-pipe-1")
        .executeTakeFirstOrThrow();
      expect(row.state).toBe("scored");
      expect(row.hold_reason).toContain("re-attributed");
      expect(row.release_required).toBe(true);

      const service = new CoachService(Database, mailer as any);
      expect(
        (await service.listPipelineFailures()).sessions.find(
          (f) => f.sourceSessionId === "ff-pipe-1",
        ),
      ).toMatchObject({ state: "scored", action: "release" });
      const released = await service.releaseHeldReport(
        result.reportId as string,
      );
      expect(released.delivered).toBe(true);
      expect(mailer.sent.length).toBeGreaterThan(0);
    } finally {
      await conn
        .deleteFrom("coach_leaders")
        .where("slug", "=", OTHER)
        .execute();
    }
  });

  it("a scored session awaiting release with no hold reason is still listed for release", async () => {
    const [published] = await pipeline(null).run();
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "scored", hold_reason: null, release_required: true })
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();
    const listed = (
      await new CoachService(Database).listPipelineFailures()
    ).sessions.find((f) => f.reportId === published.reportId);
    expect(listed).toMatchObject({ state: "scored", action: "release" });
    expect(listed?.reason).toContain("re-attributed");
  });

  it.each(["delivery_pending", "delivery_failed"])(
    "a %s session awaiting release is listed for release, and the release delivers it",
    async (state) => {
      const [published] = await pipeline(null).run();
      await conn
        .updateTable("coach_intake_sessions")
        .set({ state, release_required: true, retry_count: 5 })
        .where("source_session_id", "=", "ff-pipe-1")
        .execute();
      const mailer = new FakeMailer();
      const service = new CoachService(Database, mailer as any);
      expect(
        (await service.listPipelineFailures()).sessions.find(
          (f) => f.reportId === published.reportId,
        ),
      ).toMatchObject({ state, action: "release" });
      const released = await service.releaseHeldReport(
        published.reportId as string,
      );
      expect(released.delivered).toBe(true);
      expect(mailer.sent.length).toBeGreaterThan(0);
    },
  );

  it("a throw during delivery leaves the published session queued for redelivery", async () => {
    const throwing = {
      deliver: async () => {
        throw new Error("the governance read timed out");
      },
    };
    const svc = new CoachPipelineService(
      Database,
      new FakeClient(),
      new FakeMailer() as any,
      {
        scoring: new CoachScoringService(Database, new FakeAi()),
        frames: noFrames as any,
        delivery: throwing as any,
      },
    );
    await svc.run();
    expect((await intakeRow("ff-pipe-1")).state).toBe("delivery_pending");

    const mailer = new FakeMailer();
    const retried = await pipeline(mailer).run();
    expect(retried.map((r) => r.outcome)).toEqual(["scored-and-delivered"]);
    expect(mailer.sent.length).toBeGreaterThan(0);
  });

  it("a redelivery that throws is reported and does not stop the tick", async () => {
    const throwing = {
      deliver: async () => {
        throw new Error("the governance read timed out");
      },
    };
    const svc = new CoachPipelineService(
      Database,
      new FakeClient(),
      new FakeMailer() as any,
      {
        scoring: new CoachScoringService(Database, new FakeAi()),
        frames: noFrames as any,
        delivery: throwing as any,
      },
    );
    await svc.run();
    expect((await intakeRow("ff-pipe-1")).state).toBe("delivery_pending");
    await seedRetained("ff-pipe-2");

    const results = await svc.run();
    expect(
      results.find((r) => r.sourceSessionId === "ff-pipe-1"),
    ).toMatchObject({
      outcome: "delivery-failed",
      detail: "the governance read timed out",
    });
    expect(results.some((r) => r.sourceSessionId === "ff-pipe-2")).toBe(true);
  });

  it("a report held for calibration does not starve a retryable one out of the batch", async () => {
    for (let i = 0; i < PIPELINE_BATCH_LIMIT; i += 1) {
      const id = `ff-extra-cal-${i}`;
      await conn
        .insertInto("coach_reports")
        .values({
          id,
          coach_id: COACH,
          session_date: "2026-08-01",
          source_session_id: id,
          legacy_ids: [],
          summary: {},
          metrics: {},
          body: {},
          held: true,
        })
        .execute();
      await conn
        .insertInto("coach_report_dimension_scores")
        .values({
          report_id: id,
          dimension_n: 1,
          score: 3,
          rationale: "r",
          provenance: "machine",
          model_version: "an-uncalibrated-version",
        })
        .execute();
      await conn
        .insertInto("coach_intake_sessions")
        .values({
          source_session_id: id,
          coach_id: COACH,
          matched_by: "title_match",
          title: "t",
          session_date: "2026-08-01",
          state: "delivery_pending",
          report_id: id,
          hold_reason: "held for calibration: no calibration is recorded",
          hold_kind: "calibration",
          retry_count: 0,
        })
        .execute();
    }
    const first = await pipeline(new FakeMailer(false)).run();
    expect(first.find((o) => o.sourceSessionId === "ff-pipe-1")?.outcome).toBe(
      "delivery-failed",
    );
    expect((await intakeRow("ff-pipe-1")).retry_count).toBe(1);

    const mailer = new FakeMailer();
    const outcomes = await pipeline(mailer).run();
    expect(
      outcomes.find((o) => o.sourceSessionId === "ff-pipe-1")?.outcome,
    ).toBe("scored-and-delivered");
  });

  it("a report held for want of a mailer does not starve a retryable one out of the batch", async () => {
    const first = await pipeline(new FakeMailer(false)).run();
    expect(first.find((o) => o.sourceSessionId === "ff-pipe-1")?.outcome).toBe(
      "delivery-failed",
    );
    expect((await intakeRow("ff-pipe-1")).retry_count).toBe(1);
    for (let i = 0; i < PIPELINE_BATCH_LIMIT; i += 1) {
      const id = `ff-extra-nomail-${i}`;
      await conn
        .insertInto("coach_reports")
        .values({
          id,
          coach_id: COACH,
          session_date: "2026-08-01",
          source_session_id: id,
          legacy_ids: [],
          summary: {},
          metrics: {},
          body: {},
          held: true,
        })
        .execute();
      await conn
        .insertInto("coach_report_dimension_scores")
        .values({
          report_id: id,
          dimension_n: 1,
          score: 3,
          rationale: "r",
          provenance: "machine",
          model_version: "an-uncalibrated-version",
        })
        .execute();
      await conn
        .insertInto("coach_intake_sessions")
        .values({
          source_session_id: id,
          coach_id: COACH,
          matched_by: "title_match",
          title: "t",
          session_date: "2026-08-01",
          state: "delivery_pending",
          report_id: id,
          hold_reason: "held: no mailer was configured",
          hold_kind: "no-mailer",
          retry_count: 0,
        })
        .execute();
    }

    const mailer = new FakeMailer();
    const outcomes = await pipeline(mailer).run();
    expect(
      outcomes.find((o) => o.sourceSessionId === "ff-pipe-1")?.outcome,
    ).toBe("scored-and-delivered");
  });

  it("a re-score's baseline leaves out the session being re-scored", async () => {
    await conn
      .insertInto("coach_reports")
      .values({
        id: "pipe-coach-first-publish",
        coach_id: COACH,
        session_date: "2026-08-15",
        source_session_id: "ff-pipe-1",
        legacy_ids: [],
        summary: {},
        metrics: JSON.stringify({
          dimensions: [{ n: 8, score: 1, note: "r" }],
        }),
        body: {},
      })
      .execute();
    await pipeline(new FakeMailer()).run();
    expect(await storedAuthenticity()).toMatchObject({ score: 4 });
    expect((await storedAuthenticity()).rationale).not.toContain("held at");
  });
});

describe("every hold carries a structured kind beside its prose", () => {
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

  async function kind() {
    return (
      await conn
        .selectFrom("coach_intake_sessions")
        .select(["hold_kind", "hold_reason"])
        .where("source_session_id", "=", "ff-pipe-1")
        .executeTakeFirstOrThrow()
    ).hold_kind;
  }

  async function listedKind() {
    return (
      await new CoachService(Database).listPipelineFailures({ limit: 200 })
    ).sessions.find((s) => s.sourceSessionId === "ff-pipe-1")?.holdKind;
  }

  it("a review hold from the scores is review", async () => {
    await pipeline(new FakeMailer(), new FakeAi(5)).run();
    expect(await kind()).toBe("review");
    expect(await listedKind()).toBe("review");
  });

  it("a calibration hold is calibration", async () => {
    await uncalibrate();
    await pipeline(new FakeMailer()).run();
    expect(await kind()).toBe("calibration");
    expect(await listedKind()).toBe("calibration");
  });

  it("no mailer is no-mailer", async () => {
    await pipeline(null).run();
    expect(await kind()).toBe("no-mailer");
  });

  it("a session awaiting release is reattributed", async () => {
    await conn
      .updateTable("coach_intake_sessions")
      .set({ release_required: true })
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();
    await pipeline(new FakeMailer()).run();
    expect(await kind()).toBe("reattributed");
    expect(await listedKind()).toBe("reattributed");
  });

  it("a governance block is governance", async () => {
    await priorReport("pipe-coach-prior-evidence", "2026-08-15", 4);
    await conn
      .updateTable("coach_reports")
      .set({ evidence: JSON.stringify({ quotes: [], timestamps: ["12:01"] }) })
      .where("id", "=", "pipe-coach-prior-evidence")
      .execute();
    await pipeline(new FakeMailer()).run();
    expect(await kind()).toBe("governance");
    expect(await listedKind()).toBe("governance");
  });

  it("a failed send is send-failed, and delivery clears it", async () => {
    await pipeline(new FakeMailer(false)).run();
    expect(await kind()).toBe("send-failed");
    expect(await listedKind()).toBe("send-failed");
    await pipeline(new FakeMailer()).run();
    expect(await kind()).toBeNull();
  });
});

describe("Every Score Carries Provenance through a re-score", () => {
  const OTHER = "pipe-provenance-other";

  async function clearOther() {
    await conn
      .deleteFrom("coach_reports")
      .where("coach_id", "=", OTHER)
      .execute();
    await conn.deleteFrom("coach_leaders").where("slug", "=", OTHER).execute();
  }

  beforeEach(async () => {
    await clear();
    await clearOther();
    await conn
      .insertInto("coach_leaders")
      .values([
        { slug: COACH, email: EMAIL, name: "Pipe Leader" },
        {
          slug: OTHER,
          email: "pipe-provenance-other@example.test",
          name: "Other Leader",
        },
      ])
      .execute();
    await seedRetained();
    await calibrate();
  });
  afterEach(async () => {
    await clear();
    await clearOther();
    await uncalibrate();
  });

  async function storedRows(reportId: string) {
    return conn
      .selectFrom("coach_report_dimension_scores")
      .select(["dimension_n", "score", "rationale", "provenance"])
      .where("report_id", "=", reportId)
      .orderBy("dimension_n")
      .execute();
  }

  async function expectReportShowsRows(reportId: string) {
    const rows = await storedRows(reportId);
    const report = await conn
      .selectFrom("coach_reports")
      .select(["summary", "metrics"])
      .where("id", "=", reportId)
      .executeTakeFirstOrThrow();
    const metrics = report.metrics as {
      base: number;
      newcomerBonus: number;
      sizeBonus: number;
      dimensions: Array<{ n: number; score: number | null; note: string }>;
    };
    const { base } = composeBaseScore(
      new Map(rows.map((r) => [r.dimension_n, r.score])),
    );
    expect(metrics.base).toBeCloseTo(base, 6);
    expect((report.summary as { score: number }).score).toBeCloseTo(
      composeComposite(base, metrics),
      6,
    );
    for (const row of rows)
      expect(
        metrics.dimensions.find((d) => d.n === row.dimension_n),
      ).toMatchObject({
        score: row.score,
        note: row.rationale,
      });
    return rows;
  }

  async function correctDimensionThree(reportId: string) {
    const result = await new CoachService(Database).correctDimension({
      reportId,
      dimensionN: 3,
      score: 1,
      rationale: "admin: dimension 3 missed",
      correctedByUserId: null,
    });
    expect(result.ok).toBe(true);
  }

  it("Provenance survives a re-score: the leader's report shows the human score and the composite computed from it", async () => {
    const [scored] = await pipeline(null).run();
    const reportId = scored.reportId as string;
    await correctDimensionThree(reportId);
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "retained" })
      .where("source_session_id", "=", "ff-pipe-1")
      .execute();

    const [again] = await pipeline(null).run();
    expect(again.reportId).toBe(reportId);
    const rows = await expectReportShowsRows(reportId);
    expect(rows.find((r) => r.dimension_n === 3)).toMatchObject({
      score: 1,
      provenance: "human",
    });
  });

  it("A session moves to another leader: the previous leader's corrections do not carry over, and it is held until released", async () => {
    const [scored] = await pipeline(null).run();
    const reportId = scored.reportId as string;
    const service = new CoachService(Database);
    await correctDimensionThree(reportId);
    expect(
      await service.setFirstLesson({
        reportId,
        firstLesson: true,
        byUserId: null,
      }),
    ).toMatchObject({ applied: true });

    expect(
      await reattributeSession(Database, "ff-pipe-1", OTHER, COACH),
    ).toMatchObject({ ok: true, state: "retained" });
    const mailer = new FakeMailer();
    const [again] = await pipeline(mailer).run();
    expect(again.outcome).toBe("scored-awaiting-review");
    expect(mailer.sent).toEqual([]);

    const rows = await expectReportShowsRows(reportId);
    expect(rows.every((r) => r.provenance === "machine")).toBe(true);
    expect(rows.find((r) => r.dimension_n === 3)?.score).toBe(4);
    expect(rows.find((r) => r.dimension_n === 9)?.score).toBe(4);
    const report = await conn
      .selectFrom("coach_reports")
      .select(["coach_id", "first_lesson", "first_lesson_source"])
      .where("id", "=", reportId)
      .executeTakeFirstOrThrow();
    expect(report).toEqual({
      coach_id: OTHER,
      first_lesson: false,
      first_lesson_source: null,
    });
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
