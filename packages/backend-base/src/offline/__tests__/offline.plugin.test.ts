import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { Elysia } from "elysia";
import { type OfflineManifest, OfflineRepository } from "../offline.repository";

const mockManifest: OfflineManifest = {
  bible_versions: [
    {
      key: "NASB1995",
      name: "NASB",
      language: "en-US",
      updated_at: "2025-01-01T00:00:00Z",
      size_bytes: 100,
    },
  ],
  commentary_languages: [],
  topic_languages: [],
};

const mockLastModified = new Date("2025-01-01T00:00:00Z");

const SIGNED_IN_USER = `offline-reader-${randomUUID()}`;
let validToken: string;
let revokedToken: string;

function commentary(chapterNumber: number) {
  return {
    explanation_id: chapterNumber,
    book_id: 1,
    chapter_number: chapterNumber,
    verse_start: null,
    verse_end: null,
    type: "summary",
    explanation: "Test",
    language_code: "en",
    audios: [
      {
        explanation_id: chapterNumber,
        voice: "alloy",
        language_code: "en",
        content_hash: "a".repeat(64),
        duration_seconds: 1,
        storage_key: `audio/test/${chapterNumber}.mp3`,
      },
    ],
  };
}

const repositoryStubs = {
  buildManifest: async () => mockManifest,
  getAllVerses: async (key: string) =>
    key === "NASB1995"
      ? [{ book_id: 1, chapter_number: 1, verse_number: 1, text: "Test" }]
      : [],
  getBibleVersionUpdatedAt: async () => mockLastModified,
  getAllExplanations: async (languageCode: string) =>
    languageCode === "en" ? [commentary(1), commentary(2)] : [],
  getCommentaryUpdatedAt: async () => null,
  getAllTopics: async () => ({ topics: [], references: [], explanations: [] }),
  getTopicsUpdatedAt: async () => null,
  getAllUserNotes: async () => [],
  getAllUserHighlights: async () => [],
  getAllUserBookmarks: async () => [],
};

const repositorySpies = Object.fromEntries(
  Object.entries(repositoryStubs).map(([name, stub]) => [
    name,
    spyOn(
      OfflineRepository.prototype,
      name as keyof OfflineRepository,
    ).mockImplementation(stub as any),
  ]),
);

describe("Offline Plugin", () => {
  let app: any;

  beforeAll(async () => {
    const { default: offlinePlugin } = await import("../offline.plugin");
    const { cache } = offlinePlugin.store;
    const { jwt } = offlinePlugin.decorator;
    await cache.delete("offline:manifest");
    validToken = await jwt.sign({ sub: SIGNED_IN_USER, jti: randomUUID() });
    revokedToken = await jwt.sign({ sub: SIGNED_IN_USER, jti: randomUUID() });
    await cache.set(`accessToken:${SIGNED_IN_USER}`, [validToken], "15m");
    app = new Elysia().use(offlinePlugin);
  });

  afterAll(async () => {
    for (const spy of Object.values(repositorySpies)) spy.mockRestore();
    const { default: offlinePlugin } = await import("../offline.plugin");
    await offlinePlugin.store.cache.delete(`accessToken:${SIGNED_IN_USER}`);
    await offlinePlugin.store.cache.delete("offline:manifest");
  });

  beforeEach(() => {
    repositorySpies.getAllTopics.mockClear();
  });

  it("GET /offline/manifest returns manifest", async () => {
    const response = await app.handle(
      new Request("http://localhost/offline/manifest"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bible_versions).toHaveLength(1);
    expect(body.bible_versions[0].key).toBe("NASB1995");
  });

  it("GET /offline/bible/:versionKey returns the verses as JSON", async () => {
    const response = await app.handle(
      new Request("http://localhost/offline/bible/NASB1995"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual([
      { book_id: 1, chapter_number: 1, verse_number: 1, text: "Test" },
    ]);
  });

  it("GET /offline/bible/:versionKey returns 404 for invalid version", async () => {
    const response = await app.handle(
      new Request("http://localhost/offline/bible/INVALID"),
    );
    expect(response.status).toBe(404);
  });

  it("GET /offline/bible/:versionKey supports conditional requests (304)", async () => {
    const response = await app.handle(
      new Request("http://localhost/offline/bible/NASB1995", {
        headers: { "If-Modified-Since": "2025-01-02T00:00:00Z" },
      }),
    );
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("GET /offline/bible/:versionKey returns 200 if modified", async () => {
    const response = await app.handle(
      new Request("http://localhost/offline/bible/NASB1995", {
        headers: { "If-Modified-Since": "2024-01-01T00:00:00Z" },
      }),
    );
    expect(response.status).toBe(200);
  });

  it.each([
    "en'",
    "en%20OR%201",
    "e",
    "english-language",
    "en;",
    "%22en%22",
    "en-",
    "pt_BR",
    `zh-${"a1234567-".repeat(4)}x`,
  ])(
    "GET /offline/topics/%s refuses a malformed language code with 400 before querying",
    async (code) => {
      const response = await app.handle(
        new Request(`http://localhost/offline/topics/${code}`),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("VALIDATION_ERROR");
      expect(repositorySpies.getAllTopics).not.toHaveBeenCalled();
    },
  );

  it.each(["en", "en-US", "pt-BR", "fil", "zh-Hans", "zh-Hant-TW"])(
    "GET /offline/topics/%s accepts a well-formed language code",
    async (code) => {
      const response = await app.handle(
        new Request(`http://localhost/offline/topics/${code}`),
      );
      expect(response.status).toBe(404);
    },
  );

  function getCommentaries(headers: Record<string, string> = {}) {
    return app.handle(
      new Request("http://localhost/offline/commentaries/en", { headers }),
    );
  }

  function chaptersWithAudio(
    body: { chapter_number: number; audios: unknown[] }[],
  ) {
    return body
      .filter((entry) => entry.audios.length > 0)
      .map((entry) => entry.chapter_number);
  }

  it("GET /offline/commentaries/:languageCode lists audio to a guest only for the guest chapter", async () => {
    const response = await getCommentaries();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(response.headers.get("Vary")).toBe("Authorization");
    const body = await response.json();
    expect(body).toHaveLength(2);
    expect(chaptersWithAudio(body)).toEqual([1]);
  });

  it("GET /offline/commentaries/:languageCode lists every audio to a signed-in reader, privately", async () => {
    const response = await getCommentaries({
      authorization: `Bearer ${validToken}`,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=86400",
    );
    expect(response.headers.get("Vary")).toBe("Authorization");
    const body = await response.json();
    expect(chaptersWithAudio(body)).toEqual([1, 2]);
    expect(body[1].audios[0].audio_url).toContain("audio/test/2.mp3");
  });

  it("GET /offline/commentaries/:languageCode treats a revoked token as a guest", async () => {
    const response = await getCommentaries({
      authorization: `Bearer ${revokedToken}`,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(chaptersWithAudio(await response.json())).toEqual([1]);
  });
});
