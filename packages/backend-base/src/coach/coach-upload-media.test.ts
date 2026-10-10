import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db as Database } from "database";
import { sql } from "kysely";

import { CoachArchiveService } from "./coach-archive.service";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { CoachUploadMediaService, ffprobe } from "./coach-upload-media.service";
import { MemoryStorage } from "./coach-upload.fixture";
import {
  CoachUploadService,
  uploadPartKey,
  uploadSessionId,
} from "./coach-upload.service";
import { CoachService } from "./coach.service";

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
    .where((eb) =>
      eb.or([
        eb("coach_id", "=", LEADER),
        eb("source_session_id", "=", "media-bot-dup"),
      ]),
    )
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
    const service = media(
      { hasVideo: true, seconds: 3600 },
      new Error("the speech-to-text service did not answer"),
    );
    await service.process();
    await service.process();
    expect((await state(id)).upload.failure).toBe(
      "the recording could not be transcribed",
    );
    const listed = await new CoachService(Database).listPipelineFailures({
      limit: 200,
    });
    expect(
      listed.sessions.find((f) => f.sourceSessionId === uploadSessionId(id)),
    ).toMatchObject({ reason: expect.stringContaining("transcribed") });
  });

  it("a passing error is tried again before the upload fails, and the leader never sees the raw error", async () => {
    const id = await received();
    await media(
      { hasVideo: true, seconds: 3600 },
      new Error(
        "connect ECONNRESET https://store.example.test/x?X-Amz-Signature=secret",
      ),
    ).process();
    expect(await state(id)).toMatchObject({
      session: { state: "received" },
      upload: { state: "received", failure: null },
    });
    await media({ hasVideo: true, seconds: 3600 }).process();
    expect((await state(id)).session.state).toBe("retained");
  });

  it("a recording over four hours fails naming the limit", async () => {
    const id = await received();
    await media({ hasVideo: true, seconds: 5 * 3600 }).process();
    expect((await state(id)).upload.failure).toBe(
      "the recording runs over four hours, the longest an upload can be",
    );
  });

  it("a failed upload leaves nothing in storage", async () => {
    const id = await received();
    await media({ hasVideo: true, seconds: 90 }).process();
    expect((await state(id)).upload.state).toBe("failed");
    expect([...storage.objects.keys()]).toEqual([]);
  });

  it("two workers at once transcribe an upload once", async () => {
    const id = await received();
    let calls = 0;
    const counting = () =>
      new CoachUploadMediaService(Database, storage, {
        probe: { probe: async () => ({ hasVideo: true, seconds: 3600 }) },
        transcriber: {
          transcribe: async () => {
            calls += 1;
            await new Promise((r) => setTimeout(r, 50));
            return [
              { speakerId: "s", isLeader: false, text: "Hi", startTime: 0 },
            ];
          },
        },
      });
    await Promise.all([counting().process(), counting().process()]);
    expect(calls).toBe(1);
    expect((await state(id)).session.state).toBe("retained");
  });

  it("an upload left unfinished for a day is failed and its parts removed", async () => {
    const asked = await new CoachUploadService(Database, storage).request({
      coachId: LEADER,
      classKey: `group:${LEADER}`,
      sessionDate: "2026-10-02",
      fileName: "session.mp4",
      fileBytes: 3,
      contentType: "video/mp4",
      byUserId: null,
      byAdmin: false,
      today: "2026-10-08",
    });
    if (!asked.ok) throw new Error(asked.refusal);
    storage.objects.set(uploadPartKey(asked.uploadId, 1), new Uint8Array([1]));
    await conn
      .updateTable("coach_uploads")
      .set({ created_at: sql`now() - interval '25 hours'` })
      .where("id", "=", asked.uploadId as never)
      .execute();
    await media({ hasVideo: true, seconds: 3600 }).process();
    expect(
      await conn
        .selectFrom("coach_uploads")
        .select(["state", "failure"])
        .where("id", "=", asked.uploadId as never)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      state: "failed",
      failure: "the file was not finished uploading within a day",
    });
    expect(storage.objects.size).toBe(0);
  });

  it("a failed upload for a rotating class is listed with why it failed, not as unattributed", async () => {
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: "upload:media-rotating-failed",
        source: "upload",
        coach_id: null,
        matched_by: "rotating_class",
        title: "Rotating",
        session_date: "2026-10-02",
        state: "upload_failed",
        hold_reason: "the recording could not be transcribed",
      })
      .execute();
    try {
      const listed = await new CoachService(Database).listPipelineFailures({
        limit: 200,
      });
      expect(
        listed.sessions.find(
          (f) => f.sourceSessionId === "upload:media-rotating-failed",
        ),
      ).toMatchObject({
        reason: "the recording could not be transcribed",
        action: null,
      });
    } finally {
      await conn
        .deleteFrom("coach_intake_sessions")
        .where("source_session_id", "=", "upload:media-rotating-failed")
        .execute();
    }
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
    expect((report.summary as { attendees: unknown }).attendees).toBeNull();
    const read = (
      await new CoachService(Database).getReportsById("media-leader")
    )?.find((r) => r.id === result.reportId);
    expect(read?.attendees).toBeNull();
    await conn
      .deleteFrom("coach_reports")
      .where("id", "=", result.reportId as string)
      .execute();
  });
});

describe("ffmpeg reads only video containers from an upload", () => {
  it.skipIf(!Bun.which("ffprobe"))(
    "a playlist disguised as a video is refused before anything is fetched",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "coach-probe-"));
      try {
        const path = join(dir, "evil.m3u8");
        await writeFile(
          path,
          "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:9/seg.ts\n#EXT-X-ENDLIST\n",
        );
        await expect(ffprobe.probe(path)).rejects.toThrow();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});

describe("review fixes: the media worker and its races", () => {
  it("a worker that loses its upload to another worker's finished run leaves that run's recording alone", async () => {
    const id = await received();
    const sid = uploadSessionId(id);
    const service = new CoachUploadMediaService(Database, storage, {
      probe: {
        probe: async () => {
          await conn
            .updateTable("coach_intake_sessions")
            .set({ state: "retained" })
            .where("source_session_id", "=", sid)
            .execute();
          return { hasVideo: true, seconds: 90 };
        },
      },
      transcriber: { transcribe: async () => [] },
    });
    await service.process();
    expect((await state(id)).session.state).toBe("retained");
    expect(storage.objects.has(CoachArchiveService.recordingKey(sid))).toBe(
      true,
    );
  });

  it("an upload discarded while it was being processed leaves no media behind", async () => {
    const id = await received();
    const sid = uploadSessionId(id);
    const service = new CoachUploadMediaService(Database, storage, {
      probe: { probe: async () => ({ hasVideo: true, seconds: 3600 }) },
      transcriber: {
        transcribe: async () => {
          await conn
            .deleteFrom("coach_intake_sessions")
            .where("source_session_id", "=", sid)
            .execute();
          return [
            { speakerId: "s", isLeader: false, text: "Hi", startTime: 0 },
          ];
        },
      },
    });
    await service.process();
    expect(storage.objects.has(CoachArchiveService.recordingKey(sid))).toBe(
      false,
    );
    expect(storage.objects.has(CoachArchiveService.transcriptKey(sid))).toBe(
      false,
    );
    expect(
      await conn
        .selectFrom("coach_session_assets")
        .select("kind")
        .where("source_session_id", "=", sid)
        .execute(),
    ).toEqual([]);
  });

  it("a bot session parked as a duplicate of an upload that then fails goes back to be scored", async () => {
    const id = await received();
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: "media-bot-dup",
        coach_id: LEADER,
        matched_by: "title_match",
        title: "Bot",
        session_date: "2026-10-02",
        state: "duplicate",
        duplicate_of: uploadSessionId(id),
      })
      .execute();
    await media({ hasVideo: true, seconds: 90 }).process();
    expect(
      await conn
        .selectFrom("coach_intake_sessions")
        .select(["state", "duplicate_of"])
        .where("source_session_id", "=", "media-bot-dup")
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: "retained", duplicate_of: null });
  });

  it("an upload whose worker kept crashing is failed once its attempts are used up, without another try", async () => {
    const id = await received();
    await conn
      .updateTable("coach_uploads")
      .set({ attempts: 3, claimed_at: sql`now() - interval '3 hours'` })
      .where("id", "=", id as never)
      .execute();
    let called = false;
    await new CoachUploadMediaService(Database, storage, {
      probe: {
        probe: async () => {
          called = true;
          return { hasVideo: true, seconds: 3600 };
        },
      },
      transcriber: { transcribe: async () => [] },
    }).process();
    expect(called).toBe(false);
    expect((await state(id)).upload.failure).toBe(
      "the recording could not be transcribed",
    );
  });
});
