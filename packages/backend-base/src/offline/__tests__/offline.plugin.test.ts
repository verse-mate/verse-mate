import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { Elysia } from "elysia";
import { type OfflineManifest, OfflineRepository } from "../offline.repository";

// Set Env vars to prevent shared plugin crash if mock fails
process.env.ENVIRONMENT = "test";
process.env.EMAIL_FROM = "test@example.com";
process.env.MAILGUN_API_KEY = "test";
process.env.MAILGUN_DOMAIN = "test.com";
process.env.POSTHOG_API_KEY = "test";
process.env.POSTHOG_HOST = "test";

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

// In-memory cache for the mock shared plugin
const cacheStore = new Map<string, any>();
const mockCache = {
  get: async (key: string) => cacheStore.get(key) ?? null,
  set: async (key: string, value: any) => {
    cacheStore.set(key, value);
  },
  delete: async (key: string) => {
    cacheStore.delete(key);
  },
};

// Mock shared plugin with functional cache (uses .state, not .decorate)
mock.module("../../shared/shared.plugin", () => ({
  default: new Elysia({ name: "shared" })
    .state("db", {} as any)
    .state("cache", mockCache),
}));

const repositoryStubs = {
  buildManifest: async () => mockManifest,
  getAllVerses: async (key: string) =>
    key === "NASB1995"
      ? [{ book_id: 1, chapter_number: 1, verse_number: 1, text: "Test" }]
      : [],
  getBibleVersionUpdatedAt: async () => mockLastModified,
  getAllExplanations: async () => [],
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
    cacheStore.clear();
    // Dynamic import to ensure mocks and env vars are active
    const { default: offlinePlugin } = await import("../offline.plugin");
    app = new Elysia().use(offlinePlugin);
  });

  afterAll(() => {
    for (const spy of Object.values(repositorySpies)) spy.mockRestore();
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
});
