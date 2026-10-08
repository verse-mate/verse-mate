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

import {
  CoachArchiveService,
  MAX_RECORDING_BYTES,
  MAX_VIDEO_REDIRECTS,
  isAllowedVideoUrl,
  pinnedFetch,
} from "./coach-archive.service";

const publicAddress = async () => ["93.184.216.34"];

const CoachArchiveServiceTranscriptKey = (id: string) =>
  CoachArchiveService.transcriptKey(id);
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
const COACH = "archive-svc-coach";

function detail(
  over: Partial<FirefliesTranscriptDetail> = {},
): FirefliesTranscriptDetail {
  return {
    id: "ff-1",
    title: "Session",
    host_email: "fred@fireflies.ai",
    organizer_email: "fred@fireflies.ai",
    dateString: "2026-08-22T14:00:00.000Z",
    duration: 62,
    audio_url: "https://provider.test/audio.mp3",
    video_url: "https://provider.test/video.mp4",
    transcript_url: "https://provider.test/t.json",
    participantCount: 9,
    summary: { overview: "ok" },
    sentences: [
      {
        index: 0,
        speakerId: "speaker-1",
        isLeader: true,
        text: "welcome",
        start_time: 0,
        end_time: 2,
      },
    ],
    ...over,
  };
}

class FakeClient implements FirefliesDetailClient {
  constructor(private readonly d: FirefliesTranscriptDetail | null) {}
  async listTranscripts(): Promise<FirefliesTranscript[]> {
    return [];
  }
  async getTranscript(): Promise<FirefliesTranscriptDetail | null> {
    return this.d;
  }
}

/** Records what was stored, so retention is observable without a bucket. */
class FakeStorage {
  puts: Array<{ key: string; bytes: number; contentType?: string }> = [];
  deleted: string[] = [];
  async putGlobalObjectStream({
    key,
    body,
    contentType,
  }: {
    key: string;
    body: ReadableStream<Uint8Array>;
    contentType?: string;
  }): Promise<number> {
    const reader = body.getReader();
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value?.byteLength ?? 0;
    }
    this.puts.push({ key, bytes, contentType });
    return bytes;
  }
  bodies = new Map<string, string>();
  async putGlobalObject({
    key,
    body,
    contentType,
  }: {
    key: string;
    body: Buffer;
    contentType?: string;
  }): Promise<void> {
    this.puts.push({ key, bytes: body.byteLength, contentType });
    this.bodies.set(key, body.toString("utf8"));
  }
  async deleteObject(key: string): Promise<boolean> {
    this.deleted.push(key);
    return true;
  }
}

/** Serves the provider's media without a network. */
function fakeFetch(bodies: Record<string, string>) {
  return async (url: string): Promise<Response> => {
    const body = bodies[url];
    if (body === undefined) return new Response(null, { status: 404 });
    return new Response(body, { status: 200 });
  };
}

async function seedSession(id: string, state = "observed") {
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: id,
      coach_id: COACH,
      matched_by: "title_match",
      title: "Session",
      session_date: "2026-08-22",
      state,
    })
    .execute();
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
}

function service(
  client: FirefliesDetailClient,
  storage: FakeStorage,
  bodies: Record<string, string>,
) {
  return new CoachArchiveService(Database, client, {
    storage: storage as any,
    fetch: fakeFetch(bodies),
    resolve: publicAddress,
  });
}

describe("a report's evidence outlives the provider's share link", () => {
  beforeEach(clear);
  afterEach(clear);

  it("retains BOTH the recording and the transcript, keyed to the source session", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const svc = service(new FakeClient(detail()), storage, {
      "https://provider.test/video.mp4": "VIDEOBYTES",
    });

    const result = await svc.retain("ff-1");
    expect(result.retained).toBe(true);

    const assets = await conn
      .selectFrom("coach_session_assets")
      .selectAll()
      .where("source_session_id", "=", "ff-1")
      .orderBy("kind")
      .execute();
    expect(assets.map((a) => a.kind)).toEqual(["recording", "transcript"]);
    expect(assets[0].storage_key).toContain("ff-1");
    expect(Number(assets[0].byte_size)).toBeGreaterThan(0);
  });

  it("the recording is STREAMED into storage, never buffered whole", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const svc = service(new FakeClient(detail()), storage, {
      "https://provider.test/video.mp4": "VIDEOBYTES",
    });
    await svc.retain("ff-1");

    const recording = storage.puts.find((p) => p.key.includes("recording"));
    expect(recording?.contentType).toBe("video/mp4");
    expect(recording?.bytes).toBe("VIDEOBYTES".length);
  });

  it("the session moves to retained, so the pipeline can tell what it holds", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    await service(new FakeClient(detail()), storage, {
      "https://provider.test/video.mp4": "V",
    }).retain("ff-1");

    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("state")
      .where("source_session_id", "=", "ff-1")
      .executeTakeFirstOrThrow();
    expect(row.state).toBe("retained");
  });

  it("retaining resets the attempt count, so retrieval retries do not spend the scoring budget", async () => {
    await seedSession("ff-1", "held");
    await conn
      .updateTable("coach_intake_sessions")
      .set({ retry_count: 4 })
      .where("source_session_id", "=", "ff-1")
      .execute();
    await service(new FakeClient(detail()), new FakeStorage(), {
      "https://provider.test/video.mp4": "V",
    }).retain("ff-1");

    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["state", "retry_count"])
      .where("source_session_id", "=", "ff-1")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ state: "retained", retry_count: 0 });
  });

  it("retaining twice does not stage a second copy", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const svc = service(new FakeClient(detail()), storage, {
      "https://provider.test/video.mp4": "V",
    });
    await svc.retain("ff-1");
    await svc.retain("ff-1");

    const assets = await conn
      .selectFrom("coach_session_assets")
      .select("id")
      .where("source_session_id", "=", "ff-1")
      .execute();
    expect(assets.length).toBe(2);
  });

  it("a session with NO video is not retained, no audio-only report", async () => {
    // 'no report at all without retained source material' is the rule; an
    // audio-only report would score Visual Aids against nothing.
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const svc = service(
      new FakeClient(detail({ video_url: null })),
      storage,
      {},
    );

    const result = await svc.retain("ff-1");
    expect(result.retained).toBe(false);
    expect(result.reason).toBe("no-video");

    const assets = await conn
      .selectFrom("coach_session_assets")
      .select("id")
      .where("source_session_id", "=", "ff-1")
      .execute();
    expect(assets.length).toBe(0);
  });

  it("a video URL the provider will not serve leaves NOTHING half-retained", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    // 404 from the provider: the link exists but the bytes do not.
    const svc = service(new FakeClient(detail()), storage, {});

    const result = await svc.retain("ff-1");
    expect(result.retained).toBe(false);
    expect(result.reason).toBe("retrieval-failed");

    const assets = await conn
      .selectFrom("coach_session_assets")
      .select("id")
      .where("source_session_id", "=", "ff-1")
      .execute();
    expect(assets.length).toBe(0);
  });

  it("the STORED transcript carries no speaker name, the guard on what is written, not on the type", async () => {
    // The type that leaves the client has no name field (task 4.3a), but that
    // says nothing about what the archive chooses to persist. This is the
    // assertion that caught a mutation writing the provider payload alongside
    // the pseudonymised one.
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const withNames = detail() as FirefliesTranscriptDetail & {
      leaked?: unknown;
    };
    await service(new FakeClient(withNames), storage, {
      "https://provider.test/video.mp4": "V",
    }).retain("ff-1");

    const key = CoachArchiveServiceTranscriptKey("ff-1");
    const stored = storage.bodies.get(key) as string;
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored) as {
      sentences: Array<Record<string, unknown>>;
    };
    expect(stored).not.toMatch(/speaker_name/);
    expect(stored).not.toMatch(/displayName/);
    expect(Object.keys(parsed)).toEqual([
      "sourceSessionId",
      "title",
      "dateString",
      "duration",
      "participantCount",
      "summary",
      "sentences",
    ]);
    for (const sentence of parsed.sentences) {
      expect(Object.keys(sentence).sort()).toEqual([
        "end_time",
        "index",
        "isLeader",
        "speakerId",
        "start_time",
        "text",
      ]);
    }
  });

  it("the retained material is reachable by key after the provider link is gone", async () => {
    // The scenario in one assertion: what is stored is addressed by OUR key,
    // not by the provider's URL, so the URL expiring changes nothing.
    await seedSession("ff-1");
    const storage = new FakeStorage();
    await service(new FakeClient(detail()), storage, {
      "https://provider.test/video.mp4": "V",
    }).retain("ff-1");

    const asset = await conn
      .selectFrom("coach_session_assets")
      .select("storage_key")
      .where("source_session_id", "=", "ff-1")
      .where("kind", "=", "recording")
      .executeTakeFirstOrThrow();
    expect(asset.storage_key).not.toContain("provider.test");
    expect(storage.puts.some((p) => p.key === asset.storage_key)).toBe(true);
  });
});

describe("the recording fetch re-checks the allowlist on every redirect hop", () => {
  beforeEach(clear);
  afterEach(clear);

  function hopFetch(routes: Record<string, () => Response>) {
    const calls: Array<{ url: string; redirect?: RequestRedirect }> = [];
    const impl = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, redirect: init?.redirect });
      const route = routes[url];
      return route ? route() : new Response(null, { status: 404 });
    };
    return { calls, impl };
  }

  function redirectTo(location: string) {
    return () => new Response(null, { status: 302, headers: { location } });
  }

  function archive(
    fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
    storage: FakeStorage,
  ) {
    return new CoachArchiveService(Database, new FakeClient(detail()), {
      storage: storage as any,
      fetch: fetchImpl,
      resolve: publicAddress,
    });
  }

  it("every request is made with redirects handled manually", async () => {
    await seedSession("ff-1");
    const { calls, impl } = hopFetch({
      "https://provider.test/video.mp4": () => new Response("V"),
    });
    await archive(impl, new FakeStorage()).retain("ff-1");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.redirect === "manual")).toBe(true);
  });

  it("a redirect to a host off the allowlist is refused before it is requested", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const metadata =
      "https://169.254.169.254/latest/meta-data/iam/security-credentials/";
    const { calls, impl } = hopFetch({
      "https://provider.test/video.mp4": redirectTo(metadata),
      [metadata]: () => new Response("SECRET"),
    });
    const result = await archive(impl, storage).retain("ff-1");
    expect(result).toEqual({ retained: false, reason: "untrusted-video-host" });
    expect(calls.map((c) => c.url)).not.toContain(metadata);
    expect(storage.puts).toEqual([]);
  });

  it("a relative redirect is resolved against the hop it came from and followed", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const { impl } = hopFetch({
      "https://provider.test/video.mp4": redirectTo(
        "https://cdn.provider.test/signed",
      ),
      "https://cdn.provider.test/signed": redirectTo("/final.mp4"),
      "https://cdn.provider.test/final.mp4": () => new Response("VIDEO"),
    });
    const result = await archive(impl, storage).retain("ff-1");
    expect(result.retained).toBe(true);
    expect(storage.puts.find((p) => p.key.includes("recording"))?.bytes).toBe(
      "VIDEO".length,
    );
  });

  it("a redirect chain longer than the hop cap is a retrieval failure", async () => {
    await seedSession("ff-1");
    const routes: Record<string, () => Response> = {
      "https://provider.test/video.mp4": redirectTo(
        "https://provider.test/hop-0",
      ),
    };
    for (let i = 0; i < 50; i += 1) {
      routes[`https://provider.test/hop-${i}`] = redirectTo(
        `https://provider.test/hop-${i + 1}`,
      );
    }
    const { calls, impl } = hopFetch(routes);
    const storage = new FakeStorage();
    const result = await archive(impl, storage).retain("ff-1");
    expect(result).toEqual({ retained: false, reason: "retrieval-failed" });
    expect(MAX_VIDEO_REDIRECTS).toBe(3);
    expect(calls.length).toBe(4);
    expect(storage.puts).toEqual([]);
  });
});

describe("retain() applies its guards at the call, not only in the helpers", () => {
  beforeEach(clear);
  afterEach(clear);

  it("a recording whose declared size is over the ceiling is refused before anything is stored", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const result = await new CoachArchiveService(
      Database,
      new FakeClient(detail()),
      {
        storage: storage as any,
        resolve: publicAddress,
        fetch: async () =>
          new Response("V", {
            headers: {
              "content-length": String(MAX_RECORDING_BYTES + 1),
            },
          }),
      },
    ).retain("ff-1");
    expect(result).toEqual({ retained: false, reason: "recording-too-large" });
    expect(storage.puts).toEqual([]);
  });

  it("a first-hop video URL off the allowlist is never requested", async () => {
    await seedSession("ff-1");
    const offList = "https://169.254.169.254/latest/meta-data/recording.mp4";
    const requested: string[] = [];
    const storage = new FakeStorage();
    const result = await new CoachArchiveService(
      Database,
      new FakeClient(detail({ video_url: offList })),
      {
        storage: storage as any,
        resolve: publicAddress,
        fetch: async (url: string) => {
          requested.push(url);
          return new Response("SECRET");
        },
      },
    ).retain("ff-1");
    expect(result).toEqual({ retained: false, reason: "untrusted-video-host" });
    expect(requested).toEqual([]);
    expect(storage.puts).toEqual([]);
  });
});

describe("the recording body is bounded and checked, whatever the headers say", () => {
  beforeEach(clear);
  afterEach(clear);

  function streamOf(bytes: number, chunk = 256): ReadableStream<Uint8Array> {
    let sent = 0;
    return new ReadableStream({
      pull(controller) {
        if (sent >= bytes) return controller.close();
        const size = Math.min(chunk, bytes - sent);
        sent += size;
        controller.enqueue(new Uint8Array(size));
      },
    });
  }

  function archiveServing(
    response: () => Response,
    storage: FakeStorage,
    maxRecordingBytes?: number,
  ) {
    return new CoachArchiveService(Database, new FakeClient(detail()), {
      storage: storage as any,
      resolve: publicAddress,
      fetch: async () => response(),
      ...(maxRecordingBytes === undefined ? {} : { maxRecordingBytes }),
    });
  }

  async function sessionState() {
    return (
      await conn
        .selectFrom("coach_intake_sessions")
        .select("state")
        .where("source_session_id", "=", "ff-1")
        .executeTakeFirstOrThrow()
    ).state;
  }

  async function assetRows() {
    return conn
      .selectFrom("coach_session_assets")
      .select("kind")
      .where("source_session_id", "=", "ff-1")
      .execute();
  }

  it("the recording ceiling is stated", () => {
    expect(MAX_RECORDING_BYTES).toBe(8 * 1024 ** 3);
  });

  it("a response with no Content-Length is bounded by the stream itself", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const result = await archiveServing(
      () => new Response(streamOf(5000)),
      storage,
      1000,
    ).retain("ff-1");
    expect(result).toEqual({ retained: false, reason: "recording-too-large" });
    expect(storage.deleted).toContain(CoachArchiveService.recordingKey("ff-1"));
    expect(await assetRows()).toEqual([]);
    expect(await sessionState()).toBe("observed");
  });

  it("an unparseable Content-Length is unknown, not zero, and the stream bound still holds", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const result = await archiveServing(
      () =>
        new Response(streamOf(5000), { headers: { "content-length": "abc" } }),
      storage,
      1000,
    ).retain("ff-1");
    expect(result).toEqual({ retained: false, reason: "recording-too-large" });
  });

  it("an unparseable Content-Length on a recording inside the bound is retained", async () => {
    await seedSession("ff-1");
    const result = await archiveServing(
      () =>
        new Response(streamOf(500), { headers: { "content-length": "abc" } }),
      new FakeStorage(),
      1000,
    ).retain("ff-1");
    expect(result).toEqual({ retained: true, recordingBytes: 500 });
  });

  it("a truncated retrieval is not retained, and nothing of it is kept", async () => {
    await seedSession("ff-1");
    const storage = new FakeStorage();
    const result = await archiveServing(
      () =>
        new Response(streamOf(10), { headers: { "content-length": "100" } }),
      storage,
    ).retain("ff-1");
    expect(result).toEqual({ retained: false, reason: "recording-truncated" });
    expect(storage.deleted).toContain(CoachArchiveService.recordingKey("ff-1"));
    expect(await assetRows()).toEqual([]);
    expect(await sessionState()).toBe("observed");
  });

  it("an empty recording is not retained", async () => {
    await seedSession("ff-1");
    const result = await archiveServing(
      () => new Response(streamOf(0)),
      new FakeStorage(),
    ).retain("ff-1");
    expect(result).toEqual({ retained: false, reason: "recording-truncated" });
  });
});

describe("an allowlisted name is resolved, and a private address behind it is refused", () => {
  beforeEach(clear);
  afterEach(clear);

  function resolving(
    table: Record<string, string[]>,
    requested: string[],
    storage: FakeStorage,
    routes: Record<string, () => Response> = {},
  ) {
    return new CoachArchiveService(Database, new FakeClient(detail()), {
      storage: storage as any,
      resolve: async (host: string) => {
        const found = table[host];
        if (!found) throw new Error(`ENOTFOUND ${host}`);
        return found;
      },
      fetch: async (url: string) => {
        requested.push(url);
        const route = routes[url];
        return route ? route() : new Response("VIDEO");
      },
    });
  }

  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.9",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::a9fe:a9fe",
    "::7f00:1",
    "::a9fe:a9fe",
    "2002:7f00:1::1",
    "2002:a9fe:a9fe::",
  ]) {
    it(`refuses provider.test resolving to ${address}, before connecting`, async () => {
      await seedSession("ff-1");
      const requested: string[] = [];
      const storage = new FakeStorage();
      const result = await resolving(
        { "provider.test": [address] },
        requested,
        storage,
      ).retain("ff-1");
      expect(result).toEqual({
        retained: false,
        reason: "untrusted-video-host",
      });
      expect(requested).toEqual([]);
      expect(storage.puts).toEqual([]);
    });
  }

  it("one private address among several is enough to refuse", async () => {
    await seedSession("ff-1");
    const requested: string[] = [];
    const result = await resolving(
      { "provider.test": ["93.184.216.34", "10.0.0.1"] },
      requested,
      new FakeStorage(),
    ).retain("ff-1");
    expect(result.reason).toBe("untrusted-video-host");
    expect(requested).toEqual([]);
  });

  it("every redirect hop is resolved before it is requested", async () => {
    await seedSession("ff-1");
    const requested: string[] = [];
    const result = await resolving(
      {
        "provider.test": ["93.184.216.34"],
        "cdn.provider.test": ["127.0.0.1"],
      },
      requested,
      new FakeStorage(),
      {
        "https://provider.test/video.mp4": () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://cdn.provider.test/x.mp4" },
          }),
      },
    ).retain("ff-1");
    expect(result.reason).toBe("untrusted-video-host");
    expect(requested).toEqual(["https://provider.test/video.mp4"]);
  });

  it("a name that does not resolve is a retrieval failure, never a fetch", async () => {
    await seedSession("ff-1");
    const requested: string[] = [];
    const result = await resolving({}, requested, new FakeStorage()).retain(
      "ff-1",
    );
    expect(result.reason).toBe("retrieval-failed");
    expect(requested).toEqual([]);
  });

  it("a public address is fetched", async () => {
    await seedSession("ff-1");
    const requested: string[] = [];
    const result = await resolving(
      { "provider.test": ["93.184.216.34", "2606:2800:220:1::1"] },
      requested,
      new FakeStorage(),
    ).retain("ff-1");
    expect(result.retained).toBe(true);
  });
});

describe("the recording is fetched from the address that was checked, on port 443", () => {
  beforeEach(clear);
  afterEach(clear);

  it("a video URL on any port but 443 is off the allowlist", () => {
    expect(isAllowedVideoUrl("https://provider.test:8443/x.mp4")).toBe(false);
    expect(isAllowedVideoUrl("https://provider.test:80/x.mp4")).toBe(false);
    expect(isAllowedVideoUrl("https://provider.test:443/x.mp4")).toBe(true);
    expect(isAllowedVideoUrl("https://provider.test/x.mp4")).toBe(true);
  });

  it("a first hop on another port is never requested, nor is a redirect to one", async () => {
    for (const [first, routes] of [
      ["https://provider.test:8443/video.mp4", {}],
      [
        "https://provider.test/video.mp4",
        {
          "https://provider.test/video.mp4": () =>
            new Response(null, {
              status: 302,
              headers: { location: "https://provider.test:8443/x.mp4" },
            }),
        },
      ],
    ] as const) {
      await clear();
      await seedSession("ff-1");
      const requested: string[] = [];
      const result = await new CoachArchiveService(
        Database,
        new FakeClient(detail({ video_url: first })),
        {
          storage: new FakeStorage() as any,
          resolve: publicAddress,
          fetch: async (url: string) => {
            requested.push(url);
            const route = (routes as Record<string, () => Response>)[url];
            return route ? route() : new Response("VIDEO");
          },
        },
      ).retain("ff-1");
      expect(result).toEqual({
        retained: false,
        reason: "untrusted-video-host",
      });
      expect(requested).not.toContain("https://provider.test:8443/x.mp4");
      expect(requested).not.toContain("https://provider.test:8443/video.mp4");
    }
  });

  it("each hop connects to the address its name resolved to, never resolving again", async () => {
    await seedSession("ff-1");
    const answers = [["93.184.216.34"], ["127.0.0.1"]];
    const connectedTo: string[] = [];
    const result = await new CoachArchiveService(
      Database,
      new FakeClient(detail()),
      {
        storage: new FakeStorage() as any,
        resolve: async () => answers.shift() ?? ["127.0.0.1"],
        fetch: async (_url: string, _init: RequestInit, address: string) => {
          connectedTo.push(address);
          return new Response("VIDEO");
        },
      },
    ).retain("ff-1");
    expect(result.retained).toBe(true);
    expect(connectedTo).toEqual(["93.184.216.34"]);
  });

  it("the pinned request goes to the address with the name as Host and TLS server name", async () => {
    const seen: Array<{ url: string; init: Record<string, any> }> = [];
    const delegate = async (url: string | URL, init?: RequestInit) => {
      seen.push({ url: String(url), init: init as Record<string, any> });
      return new Response("ok");
    };
    await pinnedFetch(
      "https://cdn.provider.test/a/b.mp4?sig=1",
      { redirect: "manual" },
      "93.184.216.34",
      delegate,
    );
    await pinnedFetch(
      "https://cdn.provider.test/c.mp4",
      { redirect: "manual" },
      "2606:2800:220:1::1",
      delegate,
    );
    expect(seen[0].url).toBe("https://93.184.216.34/a/b.mp4?sig=1");
    expect(seen[0].init.headers).toEqual({ host: "cdn.provider.test" });
    expect(seen[0].init.tls).toEqual({ serverName: "cdn.provider.test" });
    expect(seen[0].init.redirect).toBe("manual");
    expect(seen[1].url).toBe("https://[2606:2800:220:1::1]/c.mp4");
    expect(seen[1].init.tls).toEqual({ serverName: "cdn.provider.test" });
  });
});
