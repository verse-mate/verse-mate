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

import { CoachArchiveService } from "./coach-archive.service";
import { CoachPublishService } from "./coach-publish.service";
import { RetainedMediaService } from "./coach-retained-media.service";
import type {
  FirefliesDetailClient,
  FirefliesTranscript,
  FirefliesTranscriptDetail,
} from "./fireflies.client";

/**
 * The fixture host stands in for the provider's CDN, so it has to be on the
 * allowlist the archive checks before it fetches anything. Set here rather
 * than by rewriting the fixtures to a real Fireflies hostname: the point of
 * these tests is retention, and pinning them to a production hostname would
 * make a CDN change look like a retention bug.
 */
const ORIGINAL_ALLOWLIST = process.env.COACH_VIDEO_HOST_ALLOWLIST;
beforeAll(() => {
  process.env.COACH_VIDEO_HOST_ALLOWLIST = "provider.test";
});
afterAll(() => {
  if (ORIGINAL_ALLOWLIST === undefined)
    Reflect.deleteProperty(process.env, "COACH_VIDEO_HOST_ALLOWLIST");
  else process.env.COACH_VIDEO_HOST_ALLOWLIST = ORIGINAL_ALLOWLIST;
});

const conn = Database.getOrCreateConnection();
const COACH = "a2m-coach";
const SRC = "ff-a2m-1";

/**
 * The whole chain, with NOTHING pre-seeded: retain → publish → mint.
 *
 * Every step of this was already unit-tested and passing. The tests passed
 * because each one seeded the row the previous step was supposed to have
 * written, including `coach_session_assets.report_id`, which the archive does
 * not write and the publish step was never told to fill in. So `mint()` filtered
 * on a column that is always NULL in production: the endpoint 404'd for every
 * session, `hasRetainedRecording` was always false, the portal never showed a
 * play button, and the ON DELETE CASCADE retention guarantee never fired —
 * while recordings were being uploaded and paid for.
 *
 * A fixture that supplies what production omits is worse than no test.
 */

function detail(): FirefliesTranscriptDetail {
  return {
    id: SRC,
    title: "Obadiah, Lesson 4",
    host_email: "fred@fireflies.ai",
    organizer_email: "fred@fireflies.ai",
    dateString: "2026-08-22T14:00:00.000Z",
    duration: 62,
    audio_url: null,
    video_url: "https://provider.test/video.mp4",
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

class FakeClient implements FirefliesDetailClient {
  async listTranscripts(): Promise<FirefliesTranscript[]> {
    return [];
  }
  async getTranscript(): Promise<FirefliesTranscriptDetail | null> {
    return detail();
  }
}

class FakeStorage {
  async putGlobalObjectStream({ body }: { body: ReadableStream<Uint8Array> }) {
    const r = body.getReader();
    let n = 0;
    while (true) {
      const { done, value } = await r.read();
      if (done) break;
      n += value?.byteLength ?? 0;
    }
    return n;
  }
  async putGlobalObject() {}
  async deleteObject() {
    return true;
  }
  async getGlobalObjectUrl({ key }: { key: string }) {
    return `https://storage.test/${key}`;
  }
}

async function clear() {
  await conn
    .deleteFrom("coach_session_assets")
    .where("coach_id", "=", COACH)
    .execute();
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("coach_id", "=", COACH)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "=", COACH).execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

async function runChain() {
  await conn
    .insertInto("coach_leaders")
    .values({ slug: COACH, email: `${COACH}@example.test`, name: "A2M Leader" })
    .execute();
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: SRC,
      coach_id: COACH,
      matched_by: "title_match",
      title: "Obadiah, Lesson 4",
      session_date: "2026-08-22",
      state: "observed",
    })
    .execute();

  const storage = new FakeStorage();
  const retained = await new CoachArchiveService(Database, new FakeClient(), {
    storage: storage as any,
    fetch: async () => new Response("VIDEO", { status: 200 }),
  }).retain(SRC);
  expect(retained.retained).toBe(true);

  const published = await new CoachPublishService(Database).publish({
    sourceSessionId: SRC,
    coachId: COACH,
    sessionDate: "2026-08-22",
    sessionTitle: "Obadiah, Lesson 4",
    base: 78.1,
    clusters: [],
    dimensions: [],
    bigIdeas: [],
    feedback: {},
    attendees: 9,
    newcomers: 1,
    duration: "62 min",
  });
  return { storage, reportId: published.reportId };
}

describe("retain → publish → mint, with nothing pre-seeded", () => {
  beforeEach(clear);
  afterEach(clear);

  it("publishing links the retained assets to the report it produced", async () => {
    const { reportId } = await runChain();
    const assets = await conn
      .selectFrom("coach_session_assets")
      .select(["kind", "report_id"])
      .where("source_session_id", "=", SRC)
      .orderBy("kind")
      .execute();
    expect(assets.length).toBe(2);
    // Both, not just the recording: the transcript's retention depends on the
    // same cascade.
    expect(assets.map((a) => a.report_id)).toEqual([reportId, reportId]);
  });

  it("the detail view then reports that a recording exists", async () => {
    const { storage, reportId } = await runChain();
    const media = new RetainedMediaService(Database, storage as any);
    const state = await media.describe(COACH, reportId);
    expect(state.hasRetainedRecording).toBe(true);
    expect(state.preferred).toBe("retained");
  });

  it("and the leader can mint an address for it", async () => {
    const { storage, reportId } = await runChain();
    const media = new RetainedMediaService(Database, storage as any);
    const url = await media.mint({
      reportId,
      requesterCoachId: COACH,
      isAdmin: false,
    });
    expect(url).toContain(SRC);
  });

  it("a LEGACY id from an older email link still mints", async () => {
    // Delivered ?s= links carry the id the report had at the time. mint looked
    // the id up directly, so a re-titled report's old link 404'd on the
    // recording while the report itself still resolved.
    const { storage, reportId } = await runChain();
    await conn
      .updateTable("coach_reports")
      .set({ legacy_ids: ["older-delivered-id"] })
      .where("id", "=", reportId)
      .execute();

    const media = new RetainedMediaService(Database, storage as any);
    const url = await media.mint({
      reportId: "older-delivered-id",
      requesterCoachId: COACH,
      isAdmin: false,
    });
    expect(url).toContain(SRC);
  });

  it("deleting the report removes its retained material, the cascade actually fires", async () => {
    const { reportId } = await runChain();
    await conn.deleteFrom("coach_reports").where("id", "=", reportId).execute();
    const left = await conn
      .selectFrom("coach_session_assets")
      .select("id")
      .where("source_session_id", "=", SRC)
      .execute();
    expect(left.length).toBe(0);
  });
});
