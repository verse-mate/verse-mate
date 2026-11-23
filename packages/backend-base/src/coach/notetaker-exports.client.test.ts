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
import { NOTETAKER_URL } from "./coach-notetaker";
import {
  COACH_NOTETAKER_SHADOW,
  COACH_NOTETAKER_SINCE,
  NOTETAKER_EXPORT_TOKEN,
  NotetakerExportsClient,
  notetakerArchiveDeps,
  notetakerBot,
  notetakerShadowConfig,
  notetakerSinceSetting,
} from "./notetaker-exports.client";

/**
 * A stand-in for the notetaker's gateway: GET /exports and
 * GET /exports/<bot>/<file>, behind the export token. The real notetaker is
 * never called.
 */
const TOKEN = "export-token";
const NAMES = ["Avery Lane", "Morgan Reed", "Jordan Pike"];

const exportsList = [
  {
    bot: "bot_Later2",
    files: ["meta.json", "transcript.json", "transcript.txt", "recording.mp4"],
    transcript_id: "t2",
    title: "Philippians, Lesson 5",
    date_string: "2026-11-20T01:00:00.000Z",
    duration_min: 58,
    participants: NAMES,
    speakers: NAMES,
    source: "notetaker",
  },
  {
    bot: "bot_AbC123",
    files: ["meta.json", "transcript.json", "recording.mp4"],
    transcript_id: "t1",
    title: "Philippians, Lesson 4",
    meeting_url: "https://zoom.us/j/123",
    date_string: "2026-11-13T01:00:00.000Z",
    duration_min: 61.5,
    participants: NAMES,
    speakers: NAMES,
    source: "notetaker",
  },
  // Still being written: no transcript yet.
  {
    bot: "bot_Writing",
    files: ["meta.json"],
    title: "x",
    date_string: "2026-11-21T01:00:00.000Z",
  },
  // A folder name that would walk a path.
  { bot: "../etc", files: ["transcript.json"], date_string: "2026-11-01" },
];

const meta = {
  transcript_id: "t1",
  title: "Philippians, Lesson 4",
  meeting_url: "https://zoom.us/j/123",
  date: "2026_11_13",
  date_string: "2026-11-13T01:00:00.000Z",
  duration_min: 61.5,
  attendee_count: 3,
  participants: NAMES,
  speakers: NAMES,
  source: "notetaker",
};

const utterance = (
  name: string,
  uuid: string,
  host: boolean,
  at: number,
  text: string,
) => ({
  speaker_name: name,
  speaker_uuid: uuid,
  speaker_is_host: host,
  timestamp_ms: at,
  duration_ms: 1500,
  transcription: {
    transcript: text,
    words: [{ word: text.split(" ")[0], start: 0, end: 0.4 }],
  },
});

const START = 1_763_000_000_000;
const transcript = {
  recording_start_ms: START,
  utterances: [
    utterance("Morgan Reed", "u-2", false, START + 9000, "I think so."),
    utterance("Avery Lane", "u-1", true, START + 2000, "Welcome, everyone."),
    utterance("Jordan Pike", "u-3", false, START + 12000, ""),
    utterance("Avery Lane", "u-1", true, START + 15000, "Turn to chapter 2."),
  ],
};

let server: ReturnType<typeof Bun.serve>;
let base = "";
const seen: Array<{ path: string; auth: string | null }> = [];

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      seen.push({ path, auth: req.headers.get("authorization") });
      if (req.headers.get("authorization") !== `Bearer ${TOKEN}`)
        return new Response("no", { status: 401 });
      if (path === "/exports") return Response.json(exportsList);
      if (path === "/exports/bot_AbC123/meta.json") return Response.json(meta);
      if (path === "/exports/bot_AbC123/transcript.json")
        return Response.json(transcript);
      if (path === "/exports/bot_Broken/meta.json")
        return new Response("down", { status: 502 });
      return new Response("missing", { status: 404 });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => {
  server.stop(true);
});

const client = () => new NotetakerExportsClient({ url: base, token: TOKEN });

describe("the notetaker shadow is off unless it is switched on and fully configured", () => {
  const names = [
    COACH_NOTETAKER_SHADOW,
    NOTETAKER_URL,
    NOTETAKER_EXPORT_TOKEN,
    COACH_NOTETAKER_SINCE,
  ];
  const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  const set = (values: Record<string, string>) => {
    for (const n of names) Reflect.deleteProperty(process.env, n);
    Object.assign(process.env, values);
  };
  afterEach(() => {
    for (const n of names)
      if (saved[n] === undefined) Reflect.deleteProperty(process.env, n);
      else process.env[n] = saved[n];
  });

  const on = {
    [COACH_NOTETAKER_SHADOW]: "true",
    [NOTETAKER_URL]: "https://notetaker.example/",
    [NOTETAKER_EXPORT_TOKEN]: TOKEN,
  };

  it("off by default, and off for anything but true", () => {
    set({
      [NOTETAKER_URL]: "https://notetaker.example",
      [NOTETAKER_EXPORT_TOKEN]: TOKEN,
    });
    expect(notetakerShadowConfig()).toBeNull();
    set({ ...on, [COACH_NOTETAKER_SHADOW]: "yes" });
    expect(notetakerShadowConfig()).toBeNull();
  });

  it("on, it reads the gateway, its host and the export token", () => {
    set({ ...on, [COACH_NOTETAKER_SINCE]: "2026-12-01" });
    expect(notetakerShadowConfig()).toEqual({
      url: "https://notetaker.example",
      host: "notetaker.example",
      token: TOKEN,
      since: "2026-12-01",
    });
  });

  it("the class-list token is not the export token: without NOTETAKER_EXPORT_TOKEN it stays off", () => {
    set({
      ...on,
      [NOTETAKER_EXPORT_TOKEN]: "",
      NOTETAKER_VERSEMATE_TOKEN: "the-feed-token",
    });
    expect(notetakerShadowConfig()).toBeNull();
    Reflect.deleteProperty(process.env, "NOTETAKER_VERSEMATE_TOKEN");
  });

  it("stays off on plain http, on a port, or on an unreadable start date, rather than scoring the backlog", () => {
    set({ ...on, [NOTETAKER_URL]: "http://notetaker.example" });
    expect(notetakerShadowConfig()).toBeNull();
    set({ ...on, [NOTETAKER_URL]: "https://notetaker.example:8443" });
    expect(notetakerShadowConfig()).toBeNull();
    set({ ...on, [COACH_NOTETAKER_SINCE]: "December 1" });
    expect(notetakerShadowConfig()).toBeNull();
    set({ ...on, [COACH_NOTETAKER_SINCE]: "2026-02-30" });
    expect(notetakerShadowConfig()).toBeNull();
    expect(notetakerSinceSetting()).toBeNull();
  });
});

describe("the notetaker's exports read as the bot's transcripts", () => {
  it("lists finished exports oldest first, as prefixed sessions with no sender address", async () => {
    seen.length = 0;
    const listed = await client().listTranscripts({ since: null, limit: 50 });
    expect(listed).toEqual([
      {
        id: "notetaker:bot_AbC123",
        title: "Philippians, Lesson 4",
        host_email: null,
        organizer_email: null,
        dateString: "2026-11-13T01:00:00.000Z",
        duration: 61.5,
      },
      {
        id: "notetaker:bot_Later2",
        title: "Philippians, Lesson 5",
        host_email: null,
        organizer_email: null,
        dateString: "2026-11-20T01:00:00.000Z",
        duration: 58,
      },
    ]);
    expect(seen).toEqual([{ path: "/exports", auth: `Bearer ${TOKEN}` }]);
  });

  it("pages and filters by date like the provider, reading the gateway once", async () => {
    seen.length = 0;
    const c = client();
    const since = new Date("2026-11-15T00:00:00Z");
    expect(
      (await c.listTranscripts({ since, limit: 50 })).map((t) => t.id),
    ).toEqual(["notetaker:bot_Later2"]);
    expect(
      (await c.listTranscripts({ since: null, limit: 1, skip: 1 })).map(
        (t) => t.id,
      ),
    ).toEqual(["notetaker:bot_Later2"]);
    expect(seen).toHaveLength(1);
  });

  it("a wrong token is a loud failure, not an empty list", async () => {
    await expect(
      new NotetakerExportsClient({ url: base, token: "nope" }).listTranscripts({
        since: null,
        limit: 50,
      }),
    ).rejects.toThrow("401");
  });

  it("the transcript arrives in seconds from the recording's start, speakers numbered, the leader marked by name", async () => {
    const detail = await client().getTranscript(
      "notetaker:bot_AbC123",
      "Avery Lane",
    );
    expect(detail).not.toBeNull();
    expect(detail?.sentences).toEqual([
      {
        index: 0,
        speakerId: "speaker-1",
        isLeader: true,
        text: "Welcome, everyone.",
        start_time: 2,
        end_time: 3.5,
      },
      {
        index: 1,
        speakerId: "speaker-2",
        isLeader: false,
        text: "I think so.",
        start_time: 9,
        end_time: 10.5,
      },
      {
        index: 2,
        speakerId: "speaker-1",
        isLeader: true,
        text: "Turn to chapter 2.",
        start_time: 15,
        end_time: 16.5,
      },
    ]);
    expect(detail?.video_url).toBe(`${base}/exports/bot_AbC123/recording.mp4`);
    expect(detail?.meeting_link).toBe("https://zoom.us/j/123");
    expect(detail?.audio_url).toBeNull();
    expect(detail?.transcript_url).toBeNull();
    expect(detail?.duration).toBe(61.5);
    expect(detail?.dateString).toBe("2026-11-13T01:00:00.000Z");
  });

  it("when no speaker carries the leader's name, the meeting's host is the leader; with no leader attributed, nobody is", async () => {
    const byHost = await client().getTranscript(
      "notetaker:bot_AbC123",
      "Someone Else",
    );
    expect(byHost?.sentences.map((s) => s.isLeader)).toEqual([
      true,
      false,
      true,
    ]);
    const rotating = await client().getTranscript("notetaker:bot_AbC123", null);
    expect(rotating?.sentences.every((s) => !s.isLeader)).toBe(true);
  });

  it("NO participant or speaker name leaves the client, from the list or the transcript", async () => {
    const c = client();
    const out = JSON.stringify([
      await c.listTranscripts({ since: null, limit: 50 }),
      await c.getTranscript("notetaker:bot_AbC123", "Avery Lane"),
      await c.getTranscript("notetaker:bot_AbC123", null),
    ]);
    for (const name of NAMES) {
      expect(out).not.toContain(name);
      for (const part of name.split(" ")) expect(out).not.toContain(part);
    }
    expect(out).not.toContain("u-1");
  });

  it("a missing export is no transcript, a failing gateway throws, and an id that is not the notetaker's is never sent to it", async () => {
    expect(await client().getTranscript("notetaker:bot_Gone", null)).toBeNull();
    await expect(
      client().getTranscript("notetaker:bot_Broken", null),
    ).rejects.toThrow("502");
    seen.length = 0;
    expect(await client().getTranscript("ff-abc", null)).toBeNull();
    expect(
      await client().getTranscript("notetaker:../../etc/passwd", null),
    ).toBeNull();
    expect(seen).toEqual([]);
    expect(notetakerBot("notetaker:bot_AbC123")).toBe("bot_AbC123");
    expect(notetakerBot("upload:bot_AbC123")).toBeNull();
  });
});

describe("the shadow's archive fetches video from the gateway only, with the token only there", () => {
  const conn = Database.getOrCreateConnection();
  const SESSION = "notetaker:bot_ArchiveT";
  const COACH = "nt-archive-coach";
  const GATEWAY = "https://notetaker.example";
  const deps = (
    calls: Array<{ url: string; headers: Record<string, string> }>,
  ) =>
    notetakerArchiveDeps(
      { host: "notetaker.example", token: TOKEN },
      async (url, init) => {
        calls.push({
          url: String(url),
          headers: init?.headers as Record<string, string>,
        });
        return new Response("VIDEO", {
          status: 200,
          headers: { "content-length": "5" },
        });
      },
    );
  class Storage {
    bodies = new Map<string, string>();
    async putGlobalObjectStream({
      key,
      body,
    }: {
      key: string;
      body: ReadableStream<Uint8Array>;
    }) {
      const text = await new Response(body).text();
      this.bodies.set(key, text);
      return text.length;
    }
    async putGlobalObject({ key, body }: { key: string; body: Buffer }) {
      this.bodies.set(key, body.toString("utf8"));
    }
    async deleteObject() {
      return true;
    }
  }
  const clear = async () => {
    await conn
      .deleteFrom("coach_session_assets")
      .where("source_session_id", "=", SESSION)
      .execute();
    await conn
      .deleteFrom("coach_intake_sessions")
      .where("source_session_id", "=", SESSION)
      .execute();
  };
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: SESSION,
        source: "notetaker",
        coach_id: COACH,
        matched_by: "title_match",
        title: "Philippians, Lesson 4",
        session_date: "2026-11-12",
        state: "observed",
        parallel_run: true,
      })
      .execute();
  });
  afterEach(clear);

  // The stand-in serves bot_AbC123; the archive is asked for the test's own
  // session id, so read that export under it, with the video URL under test.
  const aliasing = (video: string) =>
    new (class extends NotetakerExportsClient {
      override async getTranscript(_id: string, leader: string | null) {
        const d = await super.getTranscript("notetaker:bot_AbC123", leader);
        return d && { ...d, id: SESSION, video_url: video };
      }
    })({ url: base, token: TOKEN });

  it("retains the recording with the bearer added after the address is pinned, and stores no name", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const storage = new Storage();
    const result = await new CoachArchiveService(
      Database,
      aliasing(`${GATEWAY}/exports/bot_ArchiveT/recording.mp4`),
      {
        ...deps(calls),
        storage: storage as never,
        resolve: async () => ["93.184.216.34"],
      },
    ).retain(SESSION);
    expect(result.retained).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://93.184.216.34/exports/bot_ArchiveT/recording.mp4",
    );
    expect(calls[0].headers).toEqual({
      host: "notetaker.example",
      authorization: `Bearer ${TOKEN}`,
    });
    const stored = storage.bodies.get(
      CoachArchiveService.transcriptKey(SESSION),
    );
    expect(stored).toContain("Welcome, everyone.");
    for (const name of NAMES)
      for (const part of name.split(" ")) expect(stored).not.toContain(part);
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["state", "meeting_link", "parallel_run", "source"])
      .where("source_session_id", "=", SESSION)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      state: "retained",
      meeting_link: "https://zoom.us/j/123",
      parallel_run: true,
      source: "notetaker",
    });
  });

  it("refuses any other host, plain http, and a gateway name that resolves to a private address", async () => {
    const storage = new Storage();
    for (const [video, resolve] of [
      ["https://cdn.fireflies.ai/rec/abc.mp4", ["93.184.216.34"]],
      ["http://notetaker.example/exports/x/recording.mp4", ["93.184.216.34"]],
      [`${GATEWAY}/exports/x/recording.mp4`, ["10.0.0.5"]],
    ] as const) {
      const calls: Array<{ url: string; headers: Record<string, string> }> = [];
      const result = await new CoachArchiveService(Database, aliasing(video), {
        ...deps(calls),
        storage: storage as never,
        resolve: async () => [...resolve],
      }).retain(SESSION);
      expect(result).toEqual({
        retained: false,
        reason: "untrusted-video-host",
      });
      expect(calls).toEqual([]);
    }
  });

  it("the Fireflies archive does NOT accept the notetaker's host: its allow-list is unchanged", async () => {
    const saved = process.env.COACH_VIDEO_HOST_ALLOWLIST;
    Reflect.deleteProperty(process.env, "COACH_VIDEO_HOST_ALLOWLIST");
    try {
      let fetched = 0;
      const result = await new CoachArchiveService(
        Database,
        aliasing(`${GATEWAY}/exports/bot_ArchiveT/recording.mp4`),
        {
          storage: new Storage() as never,
          fetch: async () => {
            fetched += 1;
            return new Response("V");
          },
          resolve: async () => ["93.184.216.34"],
        },
      ).retain(SESSION);
      expect(result.reason).toBe("untrusted-video-host");
      expect(fetched).toBe(0);
    } finally {
      if (saved !== undefined) process.env.COACH_VIDEO_HOST_ALLOWLIST = saved;
    }
  });

  it("the token is never sent to a host that is not the gateway", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const { fetch } = deps(calls);
    await fetch?.(
      "https://cdn.fireflies.ai/rec/abc.mp4",
      { redirect: "manual" },
      "93.184.216.34",
    );
    await fetch?.(
      "https://evil.notetaker.example.attacker.test/x.mp4",
      { redirect: "manual" },
      "93.184.216.34",
    );
    expect(calls.map((c) => "authorization" in c.headers)).toEqual([
      false,
      false,
    ]);
  });
});
