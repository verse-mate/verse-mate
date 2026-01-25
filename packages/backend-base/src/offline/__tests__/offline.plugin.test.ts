import { beforeAll, describe, expect, it, mock } from "bun:test";
import { Elysia } from "elysia";

// Set Env vars to prevent shared plugin crash if mock fails
process.env.ENVIRONMENT = "test";
process.env.EMAIL_FROM = "test@example.com";
process.env.MAILGUN_API_KEY = "test";
process.env.MAILGUN_DOMAIN = "test.com";
process.env.POSTHOG_API_KEY = "test";
process.env.POSTHOG_HOST = "test";

// Mock shared plugin
mock.module("../../shared/shared.plugin", () => ({
  default: new Elysia({ name: "shared" })
    .decorate("db", {} as any)
    .decorate("cache", {} as any),
}));

// Mock Repository and Service classes
const mockOfflineServiceInstance = {
  getManifest: () => ({
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
  }),
  bibleVersionExists: (key: string) => key === "NASB1995",
  getBibleVersionData: () => Buffer.from("mock-gzip-data"),
  getBibleVersionLastModified: () => new Date("2025-01-01T00:00:00Z"),
  commentaryExists: () => false,
  topicsExist: () => false,
};

mock.module("../offline.repository", () => ({
  OfflineRepository: class {},
}));

mock.module("../offline.service", () => ({
  OfflineService: () => mockOfflineServiceInstance,
}));

describe("Offline Plugin", () => {
  let app: any;

  beforeAll(async () => {
    // Dynamic import to ensure mocks and env vars are active
    const { default: offlinePlugin } = await import("../offline.plugin");
    app = new Elysia().use(offlinePlugin);
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

  it("GET /offline/bible/:versionKey returns gzip data", async () => {
    const response = await app.handle(
      new Request("http://localhost/offline/bible/NASB1995"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Encoding")).toContain("gzip");
    expect(response.headers.get("Content-Type")).toContain("application/json");
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
        headers: { "If-Modified-Since": "2025-01-02T00:00:00Z" }, // Newer than modified date
      }),
    );
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("GET /offline/bible/:versionKey returns 200 if modified", async () => {
    const response = await app.handle(
      new Request("http://localhost/offline/bible/NASB1995", {
        headers: { "If-Modified-Since": "2024-01-01T00:00:00Z" }, // Older than modified date
      }),
    );
    expect(response.status).toBe(200);
  });
});
