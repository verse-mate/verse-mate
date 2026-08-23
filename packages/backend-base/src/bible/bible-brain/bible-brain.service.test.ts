import { describe, expect, it } from "bun:test";
import { ForbiddenError, InternalServerError } from "../../common/errors";
import { BibleBrainClient } from "./bible-brain.client";
import {
  BibleBrainService,
  signedUrlExpiresInSeconds,
} from "./bible-brain.service";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Records requests and replays canned responses keyed by URL substring. */
class FakeFetch {
  public calls: string[] = [];
  private routes: Array<{
    match: string;
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }> = [];

  on(
    match: string,
    body: unknown,
    status = 200,
    headers?: Record<string, string>,
  ) {
    this.routes.push({ match, status, body, headers });
    return this;
  }

  get impl(): typeof fetch {
    return (async (input: string | URL) => {
      const url = input.toString();
      this.calls.push(url);
      // Longest match wins so `/download/X` beats `/download`.
      const route = this.routes
        .filter((r) => url.includes(r.match))
        .sort((a, b) => b.match.length - a.match.length)[0];
      if (!route) {
        return new Response(JSON.stringify({ error: "unrouted" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(route.body), {
        status: route.status,
        headers: {
          "Content-Type": "application/json",
          ...(route.headers ?? {}),
        },
      });
    }) as unknown as typeof fetch;
  }
}

/** Minimal in-memory stand-in for the redis cache. */
class FakeCache {
  public store = new Map<string, unknown>();
  public setCalls = 0;
  async get<T>(key: string): Promise<T | null> {
    return this.store.has(key) ? (this.store.get(key) as T) : null;
  }
  async set(key: string, value: object) {
    this.setCalls++;
    this.store.set(key, value);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

const SIGNED =
  "https://cdn.example/audio/ENGESVN1DA_B04_JHN_003.mp3?Expires=2000000000&Signature=abc&Key-Pair-Id=K1";

/** No cache: every call goes to the fake upstream. */
function makeService(fake: FakeFetch) {
  return new BibleBrainService(
    new BibleBrainClient({ apiKey: "test-key", fetchImpl: fake.impl }),
  );
}

/**
 * With a cache. The service takes the redis client type, so the fake is cast at
 * this single boundary rather than growing to implement the whole interface.
 */
function makeServiceWithCache(fake: FakeFetch, cache: FakeCache) {
  return new BibleBrainService(
    new BibleBrainClient({ apiKey: "test-key", fetchImpl: fake.impl }),
    cache as unknown as ConstructorParameters<typeof BibleBrainService>[1],
  );
}

// ---------------------------------------------------------------------------

describe("signedUrlExpiresInSeconds", () => {
  it("reads the Expires claim and returns remaining seconds", () => {
    const now = 1_999_999_000 * 1000;
    expect(signedUrlExpiresInSeconds(SIGNED, now)).toBe(1000);
  });

  it("clamps an already-expired URL to zero rather than going negative", () => {
    const now = 2_000_000_500 * 1000;
    expect(signedUrlExpiresInSeconds(SIGNED, now)).toBe(0);
  });

  it("returns null when the URL carries no Expires claim", () => {
    expect(signedUrlExpiresInSeconds("https://cdn.example/a.mp3")).toBeNull();
  });

  it("returns null for a malformed URL instead of throwing", () => {
    expect(signedUrlExpiresInSeconds("not a url")).toBeNull();
  });
});

describe("BibleBrainService.isDownloadable", () => {
  it("is true when /download returns content", async () => {
    const fake = new FakeFetch().on("/download/ENGESVN1DA", {
      data: [{ book_id: "MAT", path: SIGNED }],
    });
    const svc = makeService(fake);
    expect(await svc.isDownloadable({ id: "ENGESVN1DA", size: "NT" })).toBe(
      true,
    );
  });

  it("is false when /download is Forbidden, without throwing", async () => {
    const fake = new FakeFetch().on(
      "/download/ENGNLHN1DA",
      { error: { message: "Forbidden" } },
      403,
    );
    const svc = makeService(fake);
    expect(await svc.isDownloadable({ id: "ENGNLHN1DA", size: "NT" })).toBe(
      false,
    );
  });

  it("probes Genesis for an OT fileset and Matthew for an NT one", async () => {
    const fake = new FakeFetch().on("/download/", { data: [] });
    const svc = makeService(fake);
    await svc.isDownloadable({ id: "ENGESVO1DA", size: "OT" });
    await svc.isDownloadable({ id: "ENGESVN1DA", size: "NT" });
    expect(fake.calls[0]).toContain("/download/ENGESVO1DA/GEN/1");
    expect(fake.calls[1]).toContain("/download/ENGESVN1DA/MAT/1");
  });

  it("falls back to the fileset id's collection char when size is unknown", async () => {
    const fake = new FakeFetch().on("/download/", { data: [] });
    const svc = makeService(fake);
    await svc.isDownloadable({ id: "ENGESVO1DA" });
    expect(fake.calls[0]).toContain("/GEN/1");
  });

  it("caches the verdict so a second call makes no upstream request", async () => {
    const fake = new FakeFetch().on("/download/ENGESVN1DA", {
      data: [{ path: SIGNED }],
    });
    const cache = new FakeCache();
    const svc = makeServiceWithCache(fake, cache);
    expect(await svc.isDownloadable({ id: "ENGESVN1DA", size: "NT" })).toBe(
      true,
    );
    expect(await svc.isDownloadable({ id: "ENGESVN1DA", size: "NT" })).toBe(
      true,
    );
    expect(fake.calls.length).toBe(1);
  });

  it("falls back to a live probe when the cache errors, not to false", async () => {
    // Regression: a redis outage previously made downloadable versions look
    // stream-only, silently hiding the download button.
    const fake = new FakeFetch().on("/download/ENGESVN1DA", {
      data: [{ path: SIGNED }],
    });
    const brokenCache = {
      async get() {
        throw new Error("NOAUTH Authentication required.");
      },
      async set() {
        throw new Error("NOAUTH Authentication required.");
      },
      async delete() {
        throw new Error("NOAUTH Authentication required.");
      },
    };
    const svc = new BibleBrainService(
      new BibleBrainClient({ apiKey: "test-key", fetchImpl: fake.impl }),
      brokenCache as unknown as ConstructorParameters<
        typeof BibleBrainService
      >[1],
    );
    expect(await svc.isDownloadable({ id: "ENGESVN1DA", size: "NT" })).toBe(
      true,
    );
    expect(fake.calls.length).toBe(1);
  });

  it("caches a negative verdict too (false must not be treated as a miss)", async () => {
    const fake = new FakeFetch().on("/download/", { error: {} }, 403);
    const cache = new FakeCache();
    const svc = makeServiceWithCache(fake, cache);
    expect(await svc.isDownloadable({ id: "ENGNLHN1DA", size: "NT" })).toBe(
      false,
    );
    expect(await svc.isDownloadable({ id: "ENGNLHN1DA", size: "NT" })).toBe(
      false,
    );
    expect(fake.calls.length).toBe(1);
  });
});

describe("BibleBrainService.getChapterAudio", () => {
  it("returns the signed url with duration, size and expiry", async () => {
    const fake = new FakeFetch()
      .on("/bibles/filesets/ENGESVN1DA/JHN/3", {
        data: [
          {
            book_id: "JHN",
            path: SIGNED,
            duration: 273,
            filesize_in_bytes: 2196712,
          },
        ],
      })
      .on("/download/ENGESVN1DA", { data: [{ path: SIGNED }] });
    const svc = makeService(fake);
    const audio = await svc.getChapterAudio("ENGESVN1DA", "JHN", 3);
    expect(audio).not.toBeNull();
    expect(audio?.url).toBe(SIGNED);
    expect(audio?.duration_seconds).toBe(273);
    expect(audio?.filesize_bytes).toBe(2196712);
    expect(audio?.offline_capable).toBe(true);
    expect(audio?.expires_in_seconds).toBeGreaterThan(0);
  });

  it("reports offline_capable false for a stream-only fileset", async () => {
    const fake = new FakeFetch()
      .on("/bibles/filesets/ENGNLHN1DA/JHN/3", {
        data: [{ book_id: "JHN", path: SIGNED, duration: 250 }],
      })
      .on("/download/ENGNLHN1DA", { error: {} }, 403);
    const svc = makeService(fake);
    const audio = await svc.getChapterAudio("ENGNLHN1DA", "JHN", 3);
    expect(audio?.offline_capable).toBe(false);
  });

  it("returns null when the fileset yields no playable path", async () => {
    const fake = new FakeFetch().on("/bibles/filesets/ENGESV/JHN/3", {
      data: [{ book_id: "JHN", verse_text: "text only" }],
    });
    const svc = makeService(fake);
    expect(await svc.getChapterAudio("ENGESV", "JHN", 3)).toBeNull();
  });
});

describe("BibleBrainService.getVerseTimestamps", () => {
  it("drops the verse-0 heading marker and sorts by verse", async () => {
    const fake = new FakeFetch().on("/timestamps/", {
      data: [
        { book: "JHN", chapter: "3", verse_start: "2", timestamp: 8 },
        { book: "JHN", chapter: "3", verse_start: "0", timestamp: 0 },
        { book: "JHN", chapter: "3", verse_start: "1", timestamp: 2.78 },
      ],
    });
    const svc = makeService(fake);
    const ts = await svc.getVerseTimestamps("ENGESVN1DA", "JHN", 3);
    expect(ts).toEqual([
      { verse: 1, seconds: 2.78 },
      { verse: 2, seconds: 8 },
    ]);
  });

  it("returns an empty list when the fileset has no timing (404)", async () => {
    const fake = new FakeFetch().on("/timestamps/", { error: {} }, 404);
    const svc = makeService(fake);
    expect(await svc.getVerseTimestamps("ENGBERN1DA", "JHN", 3)).toEqual([]);
  });
});

describe("BibleBrainService.listVersions", () => {
  const audioBible = {
    abbr: "ENGESV",
    name: "English Standard Version",
    vname: "ESV",
    language: "English",
    autonym: "English",
    iso: "eng",
    filesets: {
      "dbp-prod": [{ id: "ENGESVN1DA", type: "audio", size: "NT" }],
    },
  };
  const textBible = {
    ...audioBible,
    filesets: {
      "dbp-prod-text": [{ id: "ENGESV", type: "text_plain", size: "C" }],
    },
  };

  function versionsFake(downloadStatus: number) {
    return new FakeFetch()
      .on("media=audio&audio_timing=true", { data: [audioBible] })
      .on("media=audio", { data: [audioBible] })
      .on("media=text_plain", { data: [textBible] })
      .on(
        "/download/",
        downloadStatus === 200 ? { data: [{ path: SIGNED }] } : { error: {} },
        downloadStatus,
      );
  }

  it("merges text and audio filesets and flags timing + offline", async () => {
    const svc = makeService(versionsFake(200));
    const versions = await svc.listVersions("eng");
    expect(versions).toHaveLength(1);
    const esv = versions[0];
    expect(esv.abbr).toBe("ENGESV");
    expect(esv.name).toBe("ESV");
    expect(esv.has_verse_timing).toBe(true);
    expect(esv.offline_capable).toBe(true);
    expect(esv.audio_filesets.map((f) => f.id)).toEqual(["ENGESVN1DA"]);
    expect(esv.text_filesets.map((f) => f.id)).toEqual(["ENGESV"]);
  });

  it("marks a version online-only when its audio is not downloadable", async () => {
    const svc = makeService(versionsFake(403));
    const [esv] = await svc.listVersions("eng");
    expect(esv.offline_capable).toBe(false);
    expect(esv.audio_filesets[0].offline_capable).toBe(false);
    // Text filesets are never offered as downloads.
    expect(esv.text_filesets[0].offline_capable).toBe(false);
  });

  it("skips download probing entirely when includeOffline is false", async () => {
    const fake = versionsFake(200);
    const svc = makeService(fake);
    await svc.listVersions("eng", { includeOffline: false });
    expect(fake.calls.some((c) => c.includes("/download/"))).toBe(false);
  });

  it("survives a probe failure without failing the whole listing", async () => {
    const fake = new FakeFetch()
      .on("media=audio&audio_timing=true", { data: [] })
      .on("media=audio", { data: [audioBible] })
      .on("media=text_plain", { data: [] })
      .on("/download/", { error: {} }, 500);
    const svc = makeService(fake);
    const [esv] = await svc.listVersions("eng");
    expect(esv.offline_capable).toBe(false);
    expect(esv.has_verse_timing).toBe(false);
  });
});

describe("BibleBrainClient error mapping", () => {
  it("maps a non-download 403 to ForbiddenError", async () => {
    const fake = new FakeFetch().on("/bibles/filesets/", { error: {} }, 403);
    const client = new BibleBrainClient({ apiKey: "k", fetchImpl: fake.impl });
    await expect(
      client.getChapterContent("ENGESVN1DA", "JHN", 3),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("maps 422 (bad/missing key) to an InternalServerError, not a 4xx", async () => {
    const fake = new FakeFetch().on("/bibles", { error: {} }, 422);
    const client = new BibleBrainClient({ apiKey: "k", fetchImpl: fake.impl });
    await expect(client.listBibles({})).rejects.toBeInstanceOf(
      InternalServerError,
    );
  });

  it("throws when no api key is configured", async () => {
    const client = new BibleBrainClient({
      apiKey: undefined,
      fetchImpl: new FakeFetch().impl,
    });
    expect(client.isConfigured).toBe(false);
    await expect(client.listBibles({})).rejects.toThrow(/not configured/);
  });

  it("captures the rate-limit header for observability", async () => {
    const fake = new FakeFetch().on("/bibles", { data: [] }, 200, {
      "X-RateLimit-Remaining": "1498",
    });
    const client = new BibleBrainClient({ apiKey: "k", fetchImpl: fake.impl });
    await client.listBibles({});
    expect(client.rateLimitRemaining).toBe(1498);
  });

  it("sends v=4 and the key on every request", async () => {
    const fake = new FakeFetch().on("/bibles", { data: [] });
    const client = new BibleBrainClient({
      apiKey: "secret",
      fetchImpl: fake.impl,
    });
    await client.listBibles({ languageCode: "eng" });
    expect(fake.calls[0]).toContain("v=4");
    expect(fake.calls[0]).toContain("key=secret");
    expect(fake.calls[0]).toContain("language_code=eng");
  });
});
