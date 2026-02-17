import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { OfflineManifest, OfflineRepository } from "../offline.repository";
import { OfflineService } from "../offline.service";

// Create a mock repository with all methods
function createMockRepository(
  overrides?: Partial<OfflineRepository>,
): OfflineRepository {
  return {
    buildManifest: mock(() =>
      Promise.resolve<OfflineManifest>({
        bible_versions: [
          {
            key: "NASB1995",
            name: "New American Standard Bible 1995",
            language: "en",
            updated_at: "2025-01-01T00:00:00.000Z",
            size_bytes: 310000,
          },
        ],
        commentary_languages: [
          {
            code: "en",
            name: "English",
            updated_at: "2025-06-01T00:00:00.000Z",
            size_bytes: 50000,
          },
        ],
        topic_languages: [
          {
            code: "en",
            name: "English",
            updated_at: "2025-06-01T00:00:00.000Z",
            size_bytes: 20000,
          },
        ],
      }),
    ),
    getAllVerses: mock(() =>
      Promise.resolve([
        {
          book_id: 1,
          chapter_number: 1,
          verse_number: 1,
          text: "In the beginning God created the heavens and the earth.",
        },
        {
          book_id: 1,
          chapter_number: 1,
          verse_number: 2,
          text: "The earth was formless and void.",
        },
      ]),
    ),
    getBibleVersionUpdatedAt: mock(() =>
      Promise.resolve(new Date("2025-01-01T00:00:00.000Z")),
    ),
    getAllExplanations: mock(() =>
      Promise.resolve([
        {
          explanation_id: 1,
          book_id: 1,
          chapter_number: 1,
          verse_start: null,
          verse_end: null,
          type: "summary",
          explanation: "This chapter describes creation.",
          language_code: "en",
        },
      ]),
    ),
    getCommentaryUpdatedAt: mock(() =>
      Promise.resolve(new Date("2025-06-01T00:00:00.000Z")),
    ),
    getAllTopics: mock(() =>
      Promise.resolve({
        topics: [
          {
            topic_id: "t1",
            name: "Creation",
            content: "God created everything.",
            language_code: "en",
            category: "EVENT",
            sort_order: 1,
          },
        ],
        references: [
          {
            topic_id: "t1",
            reference_content:
              "## Creation\n{chapter:Genesis 1}\n{verse:Genesis 1:26-28}",
          },
        ],
        explanations: [
          {
            topic_id: "t1",
            type: "summary",
            explanation: "# Summary\nGenesis describes creation.",
            language_code: "en",
          },
        ],
      }),
    ),
    getTopicsUpdatedAt: mock(() =>
      Promise.resolve(new Date("2025-06-01T00:00:00.000Z")),
    ),
    getAllUserNotes: mock(() =>
      Promise.resolve([
        {
          note_id: "n1",
          book_id: 1,
          chapter_number: 1,
          verse_number: 1,
          content: "My note",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ]),
    ),
    getAllUserHighlights: mock(() =>
      Promise.resolve([
        {
          highlight_id: 1,
          book_id: 1,
          chapter_number: 1,
          start_verse: 1,
          end_verse: 1,
          color: "yellow",
          start_char: null,
          end_char: null,
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ]),
    ),
    getAllUserBookmarks: mock(() =>
      Promise.resolve([
        {
          favorite_id: 1,
          book_id: 1,
          chapter_number: 1,
          created_at: "2025-01-01T00:00:00.000Z",
        },
      ]),
    ),
    ...overrides,
  } as OfflineRepository;
}

// Create a mock cache
function createMockCache() {
  const store = new Map<string, any>();
  return {
    get: mock((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: mock((key: string, value: any) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: mock((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    _store: store,
  };
}

describe("OfflineService", () => {
  let service: OfflineService;
  let mockRepo: OfflineRepository;
  let mockCache: ReturnType<typeof createMockCache>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    mockCache = createMockCache();
    service = new OfflineService(mockRepo, mockCache as any);
  });

  describe("getManifest", () => {
    it("builds manifest from repository on cache miss", async () => {
      const manifest = await service.getManifest();

      expect(manifest.bible_versions).toHaveLength(1);
      expect(manifest.bible_versions[0].key).toBe("NASB1995");
      expect(manifest.commentary_languages).toHaveLength(1);
      expect(manifest.topic_languages).toHaveLength(1);
      expect(mockRepo.buildManifest).toHaveBeenCalledTimes(1);
    });

    it("returns cached manifest on cache hit", async () => {
      // First call populates cache
      await service.getManifest();
      // Second call should use cache
      await service.getManifest();

      expect(mockRepo.buildManifest).toHaveBeenCalledTimes(1);
      expect(mockCache.get).toHaveBeenCalledTimes(2);
    });

    it("invalidateManifestCache clears the cache", async () => {
      await service.getManifest();
      await service.invalidateManifestCache();

      expect(mockCache.delete).toHaveBeenCalledTimes(1);

      // Next call should rebuild
      await service.getManifest();
      expect(mockRepo.buildManifest).toHaveBeenCalledTimes(2);
    });
  });

  describe("getBibleVersionData", () => {
    it("returns all verses from the repository", async () => {
      const data = await service.getBibleVersionData("NASB1995");

      expect(mockRepo.getAllVerses).toHaveBeenCalledWith("NASB1995");
      expect(data).toHaveLength(2);
      expect(data[0].text).toBe(
        "In the beginning God created the heavens and the earth.",
      );
    });
  });

  describe("getBibleVersionLastModified", () => {
    it("returns date from repository", async () => {
      const date = await service.getBibleVersionLastModified("NASB1995");
      expect(date).toBeInstanceOf(Date);
      expect(date?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    });
  });

  describe("bibleVersionExists", () => {
    it("returns true when verses exist", async () => {
      const exists = await service.bibleVersionExists("NASB1995");
      expect(exists).toBe(true);
    });

    it("returns false when no verses exist", async () => {
      const repo = createMockRepository({
        getAllVerses: mock(() => Promise.resolve([])),
      });
      const svc = new OfflineService(repo, mockCache as any);
      const exists = await svc.bibleVersionExists("INVALID");
      expect(exists).toBe(false);
    });
  });

  describe("getCommentaryData", () => {
    it("returns commentaries from the repository", async () => {
      const data = await service.getCommentaryData("en");

      expect(mockRepo.getAllExplanations).toHaveBeenCalledWith("en");
      expect(data).toHaveLength(1);
      expect(data[0].type).toBe("summary");
    });
  });

  describe("commentaryExists", () => {
    it("returns true when commentaries exist", async () => {
      expect(await service.commentaryExists("en")).toBe(true);
    });

    it("returns false when no commentaries exist", async () => {
      const repo = createMockRepository({
        getAllExplanations: mock(() => Promise.resolve([])),
      });
      const svc = new OfflineService(repo, mockCache as any);
      expect(await svc.commentaryExists("fr")).toBe(false);
    });
  });

  describe("getTopicsData", () => {
    it("returns topics, references, and explanations from the repository", async () => {
      const data = await service.getTopicsData("en");

      expect(data.topics).toHaveLength(1);
      expect(data.topics[0].name).toBe("Creation");
      expect(data.topics[0].category).toBe("EVENT");
      expect(data.references).toHaveLength(1);
      expect(data.references[0].reference_content).toContain("{chapter:Genesis 1}");
      expect(data.explanations).toHaveLength(1);
      expect(data.explanations[0].type).toBe("summary");
    });
  });

  describe("topicsExist", () => {
    it("returns true when topics exist", async () => {
      expect(await service.topicsExist("en")).toBe(true);
    });

    it("returns false when no topics exist", async () => {
      const repo = createMockRepository({
        getAllTopics: mock(() =>
          Promise.resolve({ topics: [], references: [], explanations: [] }),
        ),
      });
      const svc = new OfflineService(repo, mockCache as any);
      expect(await svc.topicsExist("fr")).toBe(false);
    });
  });

  describe("getUserData", () => {
    it("returns notes, highlights, and bookmarks", async () => {
      const data = await service.getUserData("user-123");

      expect(data.notes).toHaveLength(1);
      expect(data.notes[0].note_id).toBe("n1");

      expect(data.highlights).toHaveLength(1);
      expect(data.highlights[0].color).toBe("yellow");

      expect(data.bookmarks).toHaveLength(1);
      expect(data.bookmarks[0].favorite_id).toBe(1);

      expect(mockRepo.getAllUserNotes).toHaveBeenCalledWith("user-123");
      expect(mockRepo.getAllUserHighlights).toHaveBeenCalledWith("user-123");
      expect(mockRepo.getAllUserBookmarks).toHaveBeenCalledWith("user-123");
    });

    it("returns empty arrays when user has no data", async () => {
      const repo = createMockRepository({
        getAllUserNotes: mock(() => Promise.resolve([])),
        getAllUserHighlights: mock(() => Promise.resolve([])),
        getAllUserBookmarks: mock(() => Promise.resolve([])),
      });
      const svc = new OfflineService(repo, mockCache as any);
      const data = await svc.getUserData("empty-user");

      expect(data.notes).toEqual([]);
      expect(data.highlights).toEqual([]);
      expect(data.bookmarks).toEqual([]);
    });
  });
});
