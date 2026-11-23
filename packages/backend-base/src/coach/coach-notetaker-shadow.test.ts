import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import { CoachArchiveService } from "./coach-archive.service";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { CoachDeliveryService } from "./coach-delivery.service";
import { CoachIntakeService } from "./coach-intake.service";
import { CoachNotetakerIntakeService } from "./coach-notetaker-intake.service";
import { endParallelRun } from "./coach-parallel-run";
import { CoachPipelineService } from "./coach-pipeline.service";
import {
  bodyAnswer,
  bodySentences,
  isBodyCall,
} from "./coach-report-body.fixture";
import { CoachReshareService } from "./coach-reshare.service";
import { CoachScoringService } from "./coach-scoring.service";
import { CoachService } from "./coach.service";
import type {
  FirefliesClient,
  FirefliesDetailClient,
  FirefliesTranscript,
  FirefliesTranscriptDetail,
} from "./fireflies.client";
import { DIMENSIONS } from "./rubric";

/**
 * The notetaker shadow (COACH_NOTETAKER_SHADOW): what intake records, and the
 * promise that holds whatever else is true, a shadow session is NEVER sent to
 * a leader, live or not, before or after the cutover.
 */

const conn = Database.getOrCreateConnection();
const LEADER = "ntsh-leader";
const EMAIL = "ntsh-leader@example.test";
const SHADOW = "notetaker:bot_ntsh1";
const BOT = "ff-ntsh-1";
const REPORT = "ntsh-report";

async function clear() {
  for (const like of ["notetaker:bot_ntsh%", "ff-ntsh-%"])
    await conn
      .deleteFrom("coach_intake_sessions")
      .where("source_session_id", "like", like)
      .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", LEADER)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "=", LEADER).execute();
}

async function leader() {
  await conn
    .insertInto("coach_leaders")
    .values({
      slug: LEADER,
      email: EMAIL,
      name: "Shadow Leader",
      title_match: ["harbor shadow study"],
      created_at: "2026-01-01 00:00:00",
    })
    .execute();
}

class Mailer {
  sent: string[] = [];
  async sendEmail(data: { to: { email: string } }) {
    this.sent.push(data.to.email);
    return { delivered: true };
  }
}

class Listed implements FirefliesClient {
  constructor(private readonly items: FirefliesTranscript[]) {}
  async listTranscripts(opts: {
    since: Date | null;
    limit: number;
    skip?: number;
  }) {
    const skip = opts.skip ?? 0;
    return this.items
      .filter(
        (t) => !opts.since || new Date(t.dateString) >= (opts.since as Date),
      )
      .slice(skip, skip + opts.limit);
  }
}

const exported = (bot: string, dateString: string): FirefliesTranscript => ({
  id: `notetaker:${bot}`,
  title: "Harbor Shadow Study, week 3",
  host_email: null,
  organizer_email: null,
  dateString,
  duration: 60,
});

describe("intake records the notetaker's sessions as a shadow", () => {
  beforeEach(async () => {
    await clear();
    await leader();
    process.env[COACH_PIPELINE_LIVE] = "true";
  });
  afterEach(async () => {
    Reflect.deleteProperty(process.env, COACH_PIPELINE_LIVE);
    await clear();
  });

  it("a parallel run whatever COACH_PIPELINE_LIVE says, attributed by its title, and recorded once", async () => {
    const client = new Listed([
      exported("bot_ntsh1", "2026-11-13T01:00:00.000Z"),
      exported("bot_ntsh2", "2026-11-20T01:00:00.000Z"),
    ]);
    const first = await new CoachNotetakerIntakeService(
      Database,
      client,
    ).poll();
    expect(first).toEqual({
      observed: 2,
      alreadySeen: 0,
      unresolved: 0,
      beforeSince: 0,
    });
    const rows = await conn
      .selectFrom("coach_intake_sessions")
      .select([
        "source_session_id",
        "source",
        "parallel_run",
        "state",
        "coach_id",
        "matched_by",
        "host_email",
        "duplicate_of",
      ])
      .select((eb) =>
        eb
          .fn<string>("to_char", ["session_date", eb.val("YYYY-MM-DD")])
          .as("date"),
      )
      .where("source_session_id", "like", "notetaker:bot_ntsh%")
      .orderBy("source_session_id")
      .execute();
    expect(rows).toEqual([
      {
        source_session_id: "notetaker:bot_ntsh1",
        source: "notetaker",
        parallel_run: true,
        state: "observed",
        coach_id: LEADER,
        matched_by: "title_match",
        host_email: null,
        duplicate_of: null,
        // Chicago's calendar date, as for the bot's sessions.
        date: "2026-11-12",
      },
      {
        source_session_id: "notetaker:bot_ntsh2",
        source: "notetaker",
        parallel_run: true,
        state: "observed",
        coach_id: LEADER,
        matched_by: "title_match",
        host_email: null,
        duplicate_of: null,
        date: "2026-11-19",
      },
    ]);

    expect(
      await new CoachNotetakerIntakeService(Database, client).poll(),
    ).toEqual({ observed: 0, alreadySeen: 2, unresolved: 0, beforeSince: 0 });
  });

  it("COACH_NOTETAKER_SINCE leaves out the backlog, to the Chicago day", async () => {
    const result = await new CoachNotetakerIntakeService(
      Database,
      new Listed([
        exported("bot_ntsh1", "2026-11-13T01:00:00.000Z"), // the 12th in Chicago
        exported("bot_ntsh2", "2026-11-14T01:00:00.000Z"), // the 13th
      ]),
      "2026-11-13",
    ).poll();
    expect(result).toMatchObject({ observed: 1, beforeSince: 1 });
    const ids = await conn
      .selectFrom("coach_intake_sessions")
      .select("source_session_id")
      .where("source_session_id", "like", "notetaker:bot_ntsh%")
      .execute();
    expect(ids).toEqual([{ source_session_id: "notetaker:bot_ntsh2" }]);
  });

  it("the bot's watermark does not move for a shadow session", async () => {
    const bot = new CoachIntakeService(Database, new Listed([]));
    const before = await bot.watermark();
    await new CoachNotetakerIntakeService(
      Database,
      new Listed([exported("bot_ntsh1", "2099-01-01T01:00:00.000Z")]),
    ).poll();
    expect(await bot.watermark()).toEqual(before);
  });
});

async function scoredShadow(over: Record<string, unknown> = {}) {
  await conn
    .insertInto("coach_reports")
    .values({
      id: REPORT,
      coach_id: LEADER,
      session_date: "2026-11-12",
      source_session_id: SHADOW,
      legacy_ids: [],
      summary: {},
      metrics: {},
      body: {},
      held: true,
    })
    .execute();
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: SHADOW,
      source: "notetaker",
      coach_id: LEADER,
      matched_by: "title_match",
      title: "Harbor Shadow Study, week 3",
      session_date: "2026-11-12",
      state: "scored",
      report_id: REPORT,
      parallel_run: true,
      ...over,
    })
    .execute();
}

const session = () =>
  conn
    .selectFrom("coach_intake_sessions")
    .select(["state", "parallel_run", "release_required", "hold_kind"])
    .where("source_session_id", "=", SHADOW)
    .executeTakeFirstOrThrow();

const held = async () =>
  (
    await conn
      .selectFrom("coach_reports")
      .select("held")
      .where("id", "=", REPORT)
      .executeTakeFirstOrThrow()
  ).held;

class FakeAi implements AiProvider {
  readonly name = "fake";
  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    if (isBodyCall(opts)) return { content: bodyAnswer(), model: "fake" };
    if (opts.messages.some((m) => m.images?.length))
      return {
        content: JSON.stringify({ score: 4, rationale: "a map on screen" }),
        model: "fake",
      };
    return {
      content: JSON.stringify({
        dimensions: DIMENSIONS.filter((d) => d.n !== 7).map((d) => ({
          n: d.n,
          score: 4,
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

/** The Fireflies client, which must never be asked about a shadow id. */
class Fireflies implements FirefliesDetailClient {
  asked: string[] = [];
  async listTranscripts(): Promise<FirefliesTranscript[]> {
    return [];
  }
  async getTranscript(id: string): Promise<FirefliesTranscriptDetail | null> {
    this.asked.push(id);
    if (id.startsWith("notetaker:"))
      throw new Error("a notetaker id reached Fireflies");
    return {
      id,
      title: "Harbor Shadow Study, week 3",
      host_email: null,
      organizer_email: null,
      dateString: "2026-11-13T01:00:00.000Z",
      duration: 60,
      audio_url: null,
      video_url: null,
      transcript_url: null,
      sentences: bodySentences(),
    };
  }
}

/** What the archive stored for the shadow session. */
class Stored {
  read: string[] = [];
  async getGlobalObjectText(key: string): Promise<string | null> {
    this.read.push(key);
    return key === CoachArchiveService.transcriptKey(SHADOW)
      ? JSON.stringify({
          sourceSessionId: SHADOW,
          duration: 60,
          sentences: bodySentences(),
        })
      : null;
  }
}

function pipeline(
  mailer: Mailer,
  fireflies = new Fireflies(),
  stored = new Stored(),
) {
  return new CoachPipelineService(Database, fireflies, mailer as never, {
    scoring: new CoachScoringService(Database, new FakeAi()),
    frames: { extract: async () => [] } as never,
    storage: stored,
  });
}

describe("a notetaker shadow session is NEVER delivered", () => {
  beforeEach(async () => {
    await clear();
    await leader();
    process.env[COACH_PIPELINE_LIVE] = "true";
  });
  afterEach(async () => {
    Reflect.deleteProperty(process.env, COACH_PIPELINE_LIVE);
    await clear();
  });

  it("live, its scored report is refused for delivery and stays held", async () => {
    await scoredShadow();
    const mailer = new Mailer();
    const result = await new CoachDeliveryService(
      Database,
      mailer as never,
    ).deliver({ reportId: REPORT, evidence: { quotes: [], timestamps: [] } });
    expect(result).toEqual({
      delivered: false,
      refusal: "parallel-run-session",
    });
    expect(mailer.sent).toEqual([]);
    expect(await held()).toBe(true);
    expect((await session()).state).toBe("scored");
  });

  it("the cutover leaves it in the parallel run, and even with that flag cleared it is never claimed, redelivered or released", async () => {
    await scoredShadow();
    await endParallelRun(Database);
    expect((await session()).parallel_run).toBe(true);

    // Suppose something cleared the flag anyway: `source` still holds.
    await conn
      .updateTable("coach_intake_sessions")
      .set({ parallel_run: false, state: "delivery_pending" })
      .where("source_session_id", "=", SHADOW)
      .execute();
    const mailer = new Mailer();
    expect(
      await new CoachDeliveryService(Database, mailer as never).deliver({
        reportId: REPORT,
        evidence: { quotes: [], timestamps: [] },
      }),
    ).toEqual({ delivered: false, refusal: "parallel-run-session" });

    const run = pipeline(mailer);
    const results = [
      ...(await run.run()),
      ...(await run.run({ notetaker: "only" })),
    ];
    expect(results.map((r) => r.sourceSessionId)).not.toContain(SHADOW);
    expect(mailer.sent).toEqual([]);

    expect(
      await new CoachService(Database, mailer as never).releaseHeldReport(
        REPORT,
      ),
    ).toEqual({ delivered: false, refusal: "parallel-run-session" });
    expect(mailer.sent).toEqual([]);
    expect(await held()).toBe(true);
    expect((await session()).state).toBe("delivery_pending");
  });

  it("an admin cannot release, requeue or ask a re-share for it, and it is not in the stuck list", async () => {
    await scoredShadow({ state: "scoring_failed" });
    const mailer = new Mailer();
    const admin = new CoachService(Database, mailer as never);
    expect(await admin.requeuePipelineFailure(SHADOW)).toBe(
      "parallel-run-session",
    );
    expect((await session()).state).toBe("scoring_failed");

    for (const state of ["scoring_failed", "delivery_failed", "scored"]) {
      await conn
        .updateTable("coach_intake_sessions")
        .set({ state, parallel_run: false, hold_kind: "review" })
        .where("source_session_id", "=", SHADOW)
        .execute();
      const { sessions } = await admin.listPipelineFailures({ limit: 500 });
      expect(sessions.map((s) => s.sourceSessionId)).not.toContain(SHADOW);
      expect(await admin.releaseHeldReport(REPORT)).toEqual({
        delivered: false,
        refusal: "parallel-run-session",
      });
      expect(await admin.requeuePipelineFailure(SHADOW)).toBe(
        "parallel-run-session",
      );
    }

    await conn
      .updateTable("coach_intake_sessions")
      .set({
        state: "retrieval_failed",
        reshare_requested_at: new Date(),
      })
      .where("source_session_id", "=", SHADOW)
      .execute();
    expect(
      await new CoachReshareService(Database, mailer as never).send(SHADOW),
    ).toEqual({ sent: false, refusal: "parallel-run-session" });
    expect(mailer.sent).toEqual([]);
  });

  it("its report is in no list an admin or the leader reads, and still opens by id for an admin", async () => {
    await scoredShadow();
    await conn
      .insertInto("coach_reports")
      .values({
        id: "ntsh-bot-report",
        coach_id: LEADER,
        session_date: "2026-11-12",
        source_session_id: BOT,
        legacy_ids: [],
        summary: {},
        metrics: {},
        body: {},
        held: true,
      })
      .execute();
    const admin = new CoachService(Database);
    const page = await admin.getReportSummaries(LEADER, {}, "admin");
    expect(page.items.map((i) => i.id)).toEqual(["ntsh-bot-report"]);
    expect(page.total).toBe(1);
    expect((await admin.getReportDetail(LEADER, REPORT, "admin"))?.id).toBe(
      REPORT,
    );
    expect(await admin.getReportDetail(LEADER, REPORT)).toBeNull();
  });
});

describe("the pipeline scores a shadow session from what the archive stored, in its own run", () => {
  const retained = async (id: string, observedAt: string, source: string) =>
    conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: id,
        source,
        coach_id: LEADER,
        matched_by: "title_match",
        title: "Harbor Shadow Study, week 3",
        session_date: "2026-11-12",
        state: "retained",
        parallel_run: true,
        observed_at: observedAt,
      })
      .execute();

  beforeEach(async () => {
    await clear();
    await leader();
    process.env[COACH_PIPELINE_LIVE] = "true";
  });
  afterEach(async () => {
    Reflect.deleteProperty(process.env, COACH_PIPELINE_LIVE);
    await clear();
  });

  it("the leaders' run never takes it: with the shadow off it waits untouched, read by nobody", async () => {
    await retained(SHADOW, "2026-11-13T02:00:00Z", "notetaker");
    const fireflies = new Fireflies();
    const stored = new Stored();
    const results = await pipeline(new Mailer(), fireflies, stored).run();
    expect(results.map((r) => r.sourceSessionId)).not.toContain(SHADOW);
    expect(fireflies.asked).not.toContain(SHADOW);
    expect(stored.read).toEqual([]);
    expect((await session()).state).toBe("retained");
  });

  it("its own run takes only it, reads it from storage, never from Fireflies, and sends nothing", async () => {
    // Observed EARLIER than the bot's session: order alone would put it first.
    await retained(SHADOW, "2026-11-13T02:00:00Z", "notetaker");
    await retained(BOT, "2026-11-13T03:00:00Z", "bot");
    const mailer = new Mailer();
    const fireflies = new Fireflies();
    const stored = new Stored();
    const run = pipeline(mailer, fireflies, stored);
    const ours = (r: { sourceSessionId: string }) =>
      [BOT, SHADOW].includes(r.sourceSessionId);
    const leaders = (await run.run()).filter(ours);
    expect(leaders.map((r) => r.sourceSessionId)).toEqual([BOT]);
    expect(stored.read).toEqual([]);

    const results = await run.run({ notetaker: "only" });
    expect(results.map((r) => r.sourceSessionId)).toEqual([SHADOW]);
    expect(fireflies.asked).toEqual([BOT]);
    expect(stored.read).toEqual([CoachArchiveService.transcriptKey(SHADOW)]);
    expect(results[0]).toMatchObject({
      outcome: "scored-awaiting-review",
      detail:
        "notetaker shadow: kept to compare with the Fireflies recording, never sent",
    });
    expect(mailer.sent).toEqual([]);
    const report = await conn
      .selectFrom("coach_reports")
      .select("held")
      .where("source_session_id", "=", SHADOW)
      .executeTakeFirstOrThrow();
    expect(report.held).toBe(true);
    expect(await session()).toMatchObject({
      state: "scored",
      parallel_run: true,
    });
  });
});
