import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachArchiveService } from "./coach-archive.service";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { CoachUploadMediaService } from "./coach-upload-media.service";
import { MemoryStorage } from "./coach-upload.fixture";
import {
  CoachUploadService,
  uploadPartKey,
  uploadSessionId,
} from "./coach-upload.service";

const conn = Database.getOrCreateConnection();
const LEADER = "media-leader";

let storage: MemoryStorage;

async function clear() {
  await conn
    .deleteFrom("coach_session_assets")
    .where("source_session_id", "like", "upload:%")
    .execute();
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("coach_id", "=", LEADER)
    .execute();
  await conn
    .deleteFrom("coach_uploads")
    .where("coach_id", "=", LEADER)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "=", LEADER).execute();
}

async function received(bytes = [1, 2, 3]): Promise<string> {
  const asked = await new CoachUploadService(Database, storage).request({
    coachId: LEADER,
    classKey: `group:${LEADER}`,
    sessionDate: "2026-10-02",
    fileName: "session.mp4",
    fileBytes: bytes.length,
    contentType: "video/mp4",
    byUserId: null,
    byAdmin: false,
    today: "2026-10-08",
  });
  if (!asked.ok) throw new Error(asked.refusal);
  storage.objects.set(uploadPartKey(asked.uploadId, 1), new Uint8Array(bytes));
  await new CoachUploadService(Database, storage).complete(
    asked.uploadId,
    null,
  );
  return asked.uploadId;
}

function media(
  probe: { hasVideo: boolean; seconds: number } | Error,
  transcript: Array<{ text: string; startTime: number }> | Error = [
    { text: "Welcome, everyone.", startTime: 0 },
    { text: "We're starting Amos this week.", startTime: 754.2 },
  ],
) {
  return new CoachUploadMediaService(Database, storage, {
    probe: {
      probe: async () => {
        if (probe instanceof Error) throw probe;
        return probe;
      },
    },
    transcriber: {
      transcribe: async () => {
        if (transcript instanceof Error) throw transcript;
        return transcript.map((l) => ({
          speakerId: "speaker",
          isLeader: false,
          ...l,
        }));
      },
    },
  });
}

async function state(uploadId: string) {
  const session = await conn
    .selectFrom("coach_intake_sessions")
    .select(["state", "hold_reason", "duration_minutes"])
    .where("source_session_id", "=", uploadSessionId(uploadId))
    .executeTakeFirstOrThrow();
  const upload = await conn
    .selectFrom("coach_uploads")
    .select(["state", "failure"])
    .where("id", "=", uploadId as never)
    .executeTakeFirstOrThrow();
  return { session, upload };
}

beforeEach(async () => {
  process.env[COACH_PIPELINE_LIVE] = "true";
  storage = new MemoryStorage();
  await clear();
  await conn
    .insertInto("coach_leaders")
    .values({
      slug: LEADER,
      email: "media-leader@example.test",
      name: "Mae Dee",
    })
    .execute();
});
afterEach(async () => {
  delete process.env[COACH_PIPELINE_LIVE];
  await clear();
});

describe("an uploaded video is checked and transcribed by the media worker (tasks 4.13, 4.14)", () => {
  it("a received upload is joined into one recording, checked, transcribed with line times, retained and ready to score", async () => {
    const id = await received([1, 2, 3]);
    const [result] = await media({ hasVideo: true, seconds: 3600 }).process();
    expect(result).toEqual({
      sourceSessionId: uploadSessionId(id),
      outcome: "retained",
    });
    const sid = uploadSessionId(id);
    expect(storage.objects.get(CoachArchiveService.recordingKey(sid))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(storage.objects.has(uploadPartKey(id, 1))).toBe(false);
    const transcript = JSON.parse(
      (await storage.getGlobalObjectText(
        CoachArchiveService.transcriptKey(sid),
      )) ?? "{}",
    );
    expect(transcript.sentences).toEqual([
      {
        index: 0,
        speakerId: "speaker",
        isLeader: false,
        text: "Welcome, everyone.",
        start_time: 0,
        end_time: null,
      },
      {
        index: 1,
        speakerId: "speaker",
        isLeader: false,
        text: "We're starting Amos this week.",
        start_time: 754.2,
        end_time: null,
      },
    ]);
    expect((await state(id)).session).toMatchObject({
      state: "retained",
      duration_minutes: "60",
    });
    const assets = await conn
      .selectFrom("coach_session_assets")
      .select(["kind", "coach_id"])
      .where("source_session_id", "=", sid)
      .orderBy("kind")
      .execute();
    expect(assets).toEqual([
      { kind: "recording", coach_id: LEADER },
      { kind: "transcript", coach_id: LEADER },
    ]);
  });

  it("A recording under two minutes fails saying it may be incomplete, and frees the class and date", async () => {
    const id = await received();
    await media({ hasVideo: true, seconds: 90 }).process();
    expect(await state(id)).toMatchObject({
      session: {
        state: "upload_failed",
        hold_reason:
          "the recording runs under two minutes and may be incomplete",
      },
      upload: {
        state: "failed",
        failure: "the recording runs under two minutes and may be incomplete",
      },
    });
    expect(
      (
        await new CoachUploadService(Database, storage).request({
          coachId: LEADER,
          classKey: `group:${LEADER}`,
          sessionDate: "2026-10-02",
          fileName: "again.mp4",
          fileBytes: 10,
          contentType: "video/mp4",
          byUserId: null,
          byAdmin: false,
          today: "2026-10-08",
        })
      ).ok,
    ).toBe(true);
  });

  it("an uploaded file with no video track fails: a report needs video", async () => {
    const id = await received();
    await media({ hasVideo: false, seconds: 3600 }).process();
    expect((await state(id)).upload.failure).toBe(
      "the file has no video track, and a report needs video",
    );
  });

  it("a file that cannot be read as a video fails saying so", async () => {
    const id = await received();
    await media(new Error("moov atom not found")).process();
    expect((await state(id)).upload.failure).toBe(
      "the file could not be read as a video",
    );
  });

  it("Transcription of an upload fails: the leader sees why, and it is listed with the pipeline's failures", async () => {
    const id = await received();
    await media(
      { hasVideo: true, seconds: 3600 },
      new Error("the speech-to-text service did not answer"),
    ).process();
    expect((await state(id)).upload.failure).toBe(
      "the recording could not be transcribed: the speech-to-text service did not answer",
    );
  });

  it("a file that did not arrive whole fails", async () => {
    const id = await received([1, 2, 3]);
    storage.objects.set(uploadPartKey(id, 1), new Uint8Array([1]));
    await media({ hasVideo: true, seconds: 3600 }).process();
    expect((await state(id)).upload.failure).toBe(
      "the file did not arrive whole",
    );
  });
});

describe("the probe reads ffprobe's answer", () => {
  it("a video stream and the duration", async () => {
    const { readProbe } = await import("./coach-upload-media.service");
    expect(
      readProbe(
        JSON.stringify({
          streams: [{ codec_type: "audio" }, { codec_type: "video" }],
          format: { duration: "3601.5" },
        }),
      ),
    ).toEqual({ hasVideo: true, seconds: 3601.5 });
    expect(
      readProbe(
        JSON.stringify({
          streams: [{ codec_type: "audio" }],
          format: { duration: "90" },
        }),
      ),
    ).toEqual({ hasVideo: false, seconds: 90 });
    expect(() => readProbe(JSON.stringify({ streams: [] }))).toThrow();
  });
});

describe("An uploaded session's report: scored from its stored transcript like a recording-bot session", () => {
  it("the pipeline reads the upload's transcript from storage, never the recording provider, and the title page leaves out the attendee count it cannot know", async () => {
    const { CoachPipelineService } = await import("./coach-pipeline.service");
    const { CoachScoringService } = await import("./coach-scoring.service");
    const { bodyAnswer, isBodyCall, BODY_TRANSCRIPT } = await import(
      "./coach-report-body.fixture"
    );
    const { DIMENSIONS } = await import("./rubric");
    const id = await received();
    await new CoachUploadMediaService(Database, storage, {
      probe: { probe: async () => ({ hasVideo: true, seconds: 5400 }) },
      transcriber: { transcribe: async () => BODY_TRANSCRIPT },
    }).process();
    const ai = {
      name: "fake",
      async chatComplete(opts: {
        messages: Array<{ content: string; images?: string[] }>;
      }) {
        if (isBodyCall(opts as never))
          return { content: bodyAnswer(), model: "fake" };
        if (opts.messages.some((m) => m.images?.length))
          return {
            content: JSON.stringify({
              score: 4,
              rationale: "a slide on screen",
            }),
            model: "fake",
          };
        return {
          content: JSON.stringify({
            dimensions: DIMENSIONS.map((d) => ({
              n: d.n,
              score: 4,
              rationale: `a reason for ${d.n}`,
            })),
          }),
          model: "fake",
        };
      },
    };
    const provider = {
      listTranscripts: async () => [],
      getTranscript: async () => {
        throw new Error("an upload never asks the recording provider");
      },
    };
    const [result] = await new CoachPipelineService(
      Database,
      provider as never,
      null,
      {
        scoring: new CoachScoringService(Database, ai as never),
        frames: { extract: async () => [] } as never,
        storage,
      },
    ).run();
    expect(result.sourceSessionId).toBe(uploadSessionId(id));
    expect(result.reportId).toBeTruthy();
    const report = await conn
      .selectFrom("coach_reports")
      .select(["body", "summary"])
      .where("id", "=", result.reportId as string)
      .executeTakeFirstOrThrow();
    const details = (
      report.body as { sections: Array<{ title: string; bullets?: string[] }> }
    ).sections.find((s) => s.title === "Session Details")?.bullets;
    expect(details).toContain(
      "Session: Lakeside — 2026-10-02".replace("Lakeside", "Mae Dee's group"),
    );
    expect(details).toContain("Duration: 90 min");
    expect(details?.some((r) => r.startsWith("Attendees"))).toBe(false);
    await conn
      .deleteFrom("coach_reports")
      .where("id", "=", result.reportId as string)
      .execute();
  });
});
