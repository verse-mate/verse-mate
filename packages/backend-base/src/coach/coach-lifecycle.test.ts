import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import { CoachAmendService } from "./coach-amend.service";
import type { RetainResult } from "./coach-archive.service";
import { recordCalibration } from "./coach-calibration";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { CoachDeliveryService } from "./coach-delivery.service";
import { CoachIntakeService } from "./coach-intake.service";
import { CoachPipelineService } from "./coach-pipeline.service";
import { CoachReshareService } from "./coach-reshare.service";
import { CoachRetrievalService } from "./coach-retrieval.service";
import { CoachScoringService } from "./coach-scoring.service";
import { CoachService } from "./coach.service";
import type {
  FirefliesDetailClient,
  FirefliesTranscript,
  FirefliesTranscriptDetail,
} from "./fireflies.client";
import { DIMENSIONS, RUBRIC_MODEL_VERSION } from "./rubric";

const conn = Database.getOrCreateConnection();
const SESSION = "ff-life-1";
const COACH = "quillon-lifecycle";
const EMAIL = "quillon-lifecycle@example.test";
const NAME = "Quillon Lifecycle";

const transcript: FirefliesTranscript = {
  id: SESSION,
  title: `${NAME} Obadiah lesson 4`,
  host_email: "bot@fireflies.ai",
  organizer_email: "bot@fireflies.ai",
  dateString: "2026-08-22T14:00:00.000Z",
  duration: 62,
};

class Provider implements FirefliesDetailClient {
  async listTranscripts(): Promise<FirefliesTranscript[]> {
    return [transcript];
  }
  async getTranscript(): Promise<FirefliesTranscriptDetail> {
    return {
      ...transcript,
      audio_url: null,
      video_url: "https://cdn.fireflies.ai/rec/life.mp4",
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

class Archive {
  async retain(id: string): Promise<RetainResult> {
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "retained" })
      .where("source_session_id", "=", id)
      .execute();
    return { retained: true };
  }
}

class Ai implements AiProvider {
  readonly name = "fake";
  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    if (opts.messages.some((m) => m.images?.length))
      return {
        content: JSON.stringify({ score: 4, rationale: "a map" }),
        model: "fake",
      };
    return {
      content: JSON.stringify({
        dimensions: DIMENSIONS.filter((d) => d.n !== 7).map((d) => ({
          n: d.n,
          score: 4,
          rationale: `a reason for dimension ${d.n} at 14:${String(d.n).padStart(2, "0")}`,
        })),
      }),
      model: "fake",
    };
  }
  private no(): never {
    throw new Error("not part of the lifecycle");
  }
  responsesCreate = () => this.no();
  filesCreate = () => this.no();
  filesRetrieve = () => this.no();
  filesContent = () => this.no();
  batchesCreate = () => this.no();
  batchesRetrieve = () => this.no();
  batchesCancel = () => this.no();
}

class Mailer {
  subjects: string[] = [];
  async sendEmail(data: { subject: string }) {
    this.subjects.push(data.subject);
    return { delivered: true };
  }
}

let calibrationRun: number | null = null;
let leaderUser = "";

async function clear() {
  await conn
    .deleteFrom("coach_session_assets")
    .where("source_session_id", "=", SESSION)
    .execute();
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "=", SESSION)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("source_session_id", "=", SESSION)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "=", COACH).execute();
  await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
}

beforeAll(() => {
  process.env[COACH_PIPELINE_LIVE] = "true";
});
afterAll(() => {
  delete process.env[COACH_PIPELINE_LIVE];
});

beforeEach(async () => {
  await clear();
  await conn
    .insertInto("coach_leaders")
    .values({ slug: COACH, email: EMAIL, name: NAME })
    .execute();
  leaderUser = (
    await conn
      .insertInto("user")
      .values({
        email: EMAIL,
        firstName: "Quillon",
        lastName: "Lifecycle",
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
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
});
afterEach(async () => {
  await clear();
  if (calibrationRun !== null)
    await conn
      .deleteFrom("coach_calibration_runs")
      .where("id", "=", calibrationRun)
      .execute();
  calibrationRun = null;
});

async function session() {
  return conn
    .selectFrom("coach_intake_sessions")
    .selectAll()
    .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
    .where("source_session_id", "=", SESSION)
    .executeTakeFirstOrThrow();
}

describe("a session walks the whole lifecycle", () => {
  it("intake, attribution, retrieval, scoring, publish, delivery, leader read, amend and revision send", async () => {
    await new CoachIntakeService(Database, new Provider()).poll();
    expect(await session()).toMatchObject({
      coach_id: COACH,
      matched_by: "name",
      state: "observed",
    });

    await new CoachRetrievalService(Database, new Archive()).sweep();
    expect((await session()).state).toBe("retained");

    const mailer = new Mailer();
    const pipeline = new CoachPipelineService(
      Database,
      new Provider(),
      mailer as never,
      {
        scoring: new CoachScoringService(Database, new Ai()),
        frames: { extract: async () => [] } as never,
      },
    );
    const results = await pipeline.run();
    const result = results.find((r) => r.sourceSessionId === SESSION);
    expect(result?.outcome).toBe("scored-and-delivered");
    const reportId = result?.reportId as string;
    expect((await session()).state).toBe("delivered");
    expect(mailer.subjects.length).toBeGreaterThan(0);

    const service = new CoachService(Database, mailer as never);
    const read = (await service.getReports(leaderUser)) ?? [];
    const seen = read.find((r) => r.id === reportId);
    expect(seen).toBeTruthy();

    mailer.subjects = [];
    const amended = await new CoachAmendService(
      Database,
      mailer as never,
    ).amend({
      reportId,
      amendment: {
        dimensions: [
          { n: 2, score: 2, rationale: "admin: the opening ran long at 14:30" },
        ],
      },
      byUserId: null,
    });
    expect(amended).toMatchObject({ applied: true, revision: 1, sent: true });
    expect(mailer.subjects.every((s) => s.endsWith("(revised)"))).toBe(true);
    const after = (await service.getReports(leaderUser))?.find(
      (r) => r.id === reportId,
    );
    expect(after?.dimensions.find((d) => d.n === 2)?.score).toBe(2);
    expect(after?.score).toBeLessThan(seen?.score ?? 0);
  });
});

function pipelineWith(mailer: Mailer) {
  return new CoachPipelineService(Database, new Provider(), mailer as never, {
    scoring: new CoachScoringService(Database, new Ai()),
    frames: { extract: async () => [] } as never,
  });
}

async function observedDuringTheParallelRun() {
  delete process.env[COACH_PIPELINE_LIVE];
  await new CoachIntakeService(Database, new Provider()).poll();
  await new CoachRetrievalService(Database, new Archive()).sweep();
  process.env[COACH_PIPELINE_LIVE] = "true";
}

describe("The Parallel Run Is Silent, after cutover too", () => {
  afterEach(() => {
    process.env[COACH_PIPELINE_LIVE] = "true";
  });

  it("a session observed while the switch was off is marked a parallel-run session for good", async () => {
    await observedDuringTheParallelRun();
    expect((await session()).parallel_run).toBe(true);
  });

  it("a session observed while the switch is on is not a parallel-run session", async () => {
    await new CoachIntakeService(Database, new Provider()).poll();
    expect((await session()).parallel_run).toBe(false);
  });

  it("a parallel-run session still unscored at cutover is scored, held and never delivered, released or redelivered", async () => {
    await observedDuringTheParallelRun();
    const mailer = new Mailer();
    const result = (await pipelineWith(mailer).run()).find(
      (r) => r.sourceSessionId === SESSION,
    );
    expect(result?.outcome).toBe("scored-awaiting-review");
    expect(result?.detail).toContain("parallel run");
    const reportId = result?.reportId as string;

    expect(
      await new CoachDeliveryService(Database, mailer as never).deliver({
        reportId,
        evidence: { quotes: [], timestamps: [] },
      }),
    ).toMatchObject({ delivered: false, refusal: "parallel-run-session" });
    const service = new CoachService(Database, mailer as never);
    expect(await service.releaseHeldReport(reportId)).toMatchObject({
      delivered: false,
      refusal: "parallel-run-session",
    });
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivery_pending" })
      .where("source_session_id", "=", SESSION)
      .execute();
    expect(
      (await pipelineWith(mailer).run()).find(
        (r) => r.sourceSessionId === SESSION,
      ),
    ).toBeUndefined();
    expect(mailer.subjects).toEqual([]);
    expect(await service.getReportDetail(COACH, reportId)).toBeNull();
    expect((await service.reviewReport(reportId))?.parallelRun).toBe(true);
  });

  it("a held parallel-run session is labelled on the failures list and offers no release", async () => {
    await observedDuringTheParallelRun();
    await pipelineWith(new Mailer()).run();
    await conn
      .updateTable("coach_intake_sessions")
      .set({
        hold_reason:
          "held for review: 9 of 11 scored dimensions came back at the maximum",
        hold_kind: "review",
      })
      .where("source_session_id", "=", SESSION)
      .execute();
    const listed = (
      await new CoachService(Database).listPipelineFailures({ limit: 200 })
    ).sessions.find((s) => s.sourceSessionId === SESSION);
    expect(listed).toMatchObject({
      parallelRun: true,
      action: null,
      sessionDate: "2026-08-22",
      sessionStartedAt: new Date(transcript.dateString),
    });
  });

  it("a parallel-run session whose delivery failed is not requeued for delivery or released", async () => {
    await observedDuringTheParallelRun();
    await pipelineWith(new Mailer()).run();
    const reportId = (await session()).report_id as string;
    await conn
      .updateTable("coach_intake_sessions")
      .set({
        state: "delivery_failed",
        hold_reason: "send failed",
        release_required: true,
        retry_count: 5,
      })
      .where("source_session_id", "=", SESSION)
      .execute();
    const service = new CoachService(Database, new Mailer() as never);
    expect(await service.requeuePipelineFailure(SESSION)).toBe(
      "parallel-run-session",
    );
    expect(await service.releaseHeldReport(reportId)).toMatchObject({
      refusal: "parallel-run-session",
    });
    expect(await session()).toMatchObject({
      state: "delivery_failed",
      release_required: true,
      retry_count: 5,
    });
    const listed = (
      await service.listPipelineFailures({ limit: 200 })
    ).sessions.find((s) => s.sourceSessionId === SESSION);
    expect(listed).toMatchObject({ parallelRun: true, action: null });
  });

  it("a parallel-run session whose recording was never retrieved is not re-share sent after cutover", async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    await new CoachIntakeService(Database, new Provider()).poll();
    process.env[COACH_PIPELINE_LIVE] = "true";
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "retrieval_failed", reshare_requested_at: sql`NOW()` })
      .where("source_session_id", "=", SESSION)
      .execute();
    const mailer = new Mailer();
    expect(
      await new CoachReshareService(Database, mailer as never).send(SESSION),
    ).toMatchObject({ sent: false, refusal: "parallel-run-session" });
    expect(mailer.subjects).toEqual([]);
    const pending = await new CoachRetrievalService(
      Database,
      new Archive(),
    ).pendingReshares();
    expect(pending.find((p) => p.sourceSessionId === SESSION)).toMatchObject({
      parallelRun: true,
    });
  });
});
