import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import {
  CoachPipelineService,
  PIPELINE_BATCH_LIMIT,
  evidenceFrom,
} from "./coach-pipeline.service";
import { CoachScoringService } from "./coach-scoring.service";
import type {
  FirefliesDetailClient,
  FirefliesTranscript,
  FirefliesTranscriptDetail,
} from "./fireflies.client";
import { DIMENSIONS } from "./rubric";

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

describe("a retained session reaches a delivered report", () => {
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: COACH, email: EMAIL, name: "Pipe Leader" })
      .execute();
    await seedRetained();
  });
  afterEach(clear);

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

  it("with NO mailer the report is still published, and nothing is claimed sent", async () => {
    const [result] = await pipeline(null).run();
    expect(result.outcome).toBe("scored-awaiting-review");
    expect(result.reportId).toBeTruthy();
  });

  it("a failed send does NOT mark the session delivered", async () => {
    const [result] = await pipeline(new FakeMailer(false)).run();
    expect(result.outcome).toBe("delivery-failed");
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("source_session_id", "=", "ff-pipe-1")
      .executeTakeFirstOrThrow();
    expect(row.state).not.toBe("delivered");
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
