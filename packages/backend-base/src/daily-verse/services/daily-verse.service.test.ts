import { describe, expect, it } from "bun:test";
import type { DailyVerseRepository } from "../repository/daily-verse.repository";
import { DailyVerseService } from "./daily-verse.service";

/**
 * Unit tests for the selection + rendering + validation logic. The service
 * takes its repository via constructor injection, so these run with an
 * in-memory fake — no database required.
 */

type Verse = {
  id: string;
  book_id: number;
  chapter_number: number;
  verse_start: number;
  verse_end: number | null;
  is_active: boolean;
};

function makeVerse(id: string, overrides: Partial<Verse> = {}): Verse {
  return {
    id,
    book_id: 1,
    chapter_number: 1,
    verse_start: 1,
    verse_end: null,
    is_active: true,
    ...overrides,
  };
}

interface FakeOptions {
  active?: Verse[];
  recentPickIds?: string[];
  existingPickId?: string | null;
  versions?: Record<string, { id: string; language_code: string }>;
  chapterId?: number | null;
  versesInRange?: Record<string, { verseNumber: number; text: string }[]>;
  localizedBookName?: string | null;
  canonicalBookName?: string | null;
  knownTagIds?: string[];
}

/** Build a fake repository capturing recordPick calls. */
function makeFakeRepo(opts: FakeOptions) {
  const recorded: { date: string; dailyVerseId: string }[] = [];
  let existingPickId = opts.existingPickId ?? null;
  const verseById = new Map(
    (opts.active ?? []).map((v) => [v.id, v] as const),
  );

  const repo = {
    recordedCalls: recorded,
    async getActiveVerses() {
      return opts.active ?? [];
    },
    async getRecentPickIds() {
      return opts.recentPickIds ?? [];
    },
    async findPickForDate() {
      return existingPickId
        ? { id: "h1", daily_verse_id: existingPickId, user_id: null }
        : null;
    },
    async recordPick({
      date,
      dailyVerseId,
    }: {
      date: string;
      dailyVerseId: string;
    }) {
      recorded.push({ date, dailyVerseId });
      // Simulate the row being persisted so subsequent reads are idempotent.
      existingPickId = existingPickId ?? dailyVerseId;
      return {
        id: "h1",
        daily_verse_id: existingPickId,
        user_id: null,
      };
    },
    async getById(id: string) {
      return verseById.get(id) ?? null;
    },
    async getTagsForVerse() {
      return [{ id: "t1", slug: "hope", label: "Hope" }];
    },
    async getVersionByKey(key: string) {
      const v = opts.versions?.[key];
      return v ? { id: v.id, version_key: key, language_code: v.language_code } : undefined;
    },
    async getChapterId() {
      return opts.chapterId ?? 100;
    },
    async getVersesInRange({ versionId }: { versionId: string }) {
      return opts.versesInRange?.[versionId] ?? [];
    },
    async getLocalizedBookName() {
      return opts.localizedBookName ?? null;
    },
    async getCanonicalBookName() {
      return opts.canonicalBookName ?? "Genesis";
    },
    async tagIdsExist(ids: string[]) {
      const known = new Set(opts.knownTagIds ?? []);
      return ids.every((id) => known.has(id));
    },
  };

  return repo as unknown as DailyVerseRepository & {
    recordedCalls: typeof recorded;
  };
}

describe("DailyVerseService.pickForDate", () => {
  it("returns null when the active pool is empty (D-25)", async () => {
    const repo = makeFakeRepo({ active: [] });
    const service = new DailyVerseService({} as any, repo);
    const result = await service.pickForDate("2026-06-08", null);
    expect(result).toBeNull();
  });

  it("is deterministic — same date picks the same verse", async () => {
    const active = [makeVerse("a"), makeVerse("b"), makeVerse("c")];
    const first = await new DailyVerseService(
      {} as any,
      makeFakeRepo({ active }),
    ).pickForDate("2026-06-08", null);
    const second = await new DailyVerseService(
      {} as any,
      makeFakeRepo({ active }),
    ).pickForDate("2026-06-08", null);
    expect(first?.verse.id).toBe(second?.verse.id);
  });

  it("relaxes the cooldown and flags poolTooSmall when all are recent (D-28)", async () => {
    const active = [makeVerse("a"), makeVerse("b")];
    const repo = makeFakeRepo({
      active,
      recentPickIds: ["a", "b"], // everything excluded by cooldown
    });
    const service = new DailyVerseService({} as any, repo);
    const result = await service.pickForDate("2026-06-08", null);
    expect(result).not.toBeNull();
    expect(result?.poolTooSmall).toBe(true);
  });

  it("returns the already-recorded pick (idempotent across the day)", async () => {
    const active = [makeVerse("a"), makeVerse("b"), makeVerse("c")];
    const repo = makeFakeRepo({ active, existingPickId: "b" });
    const service = new DailyVerseService({} as any, repo);
    const result = await service.pickForDate("2026-06-08", null);
    expect(result?.verse.id).toBe("b");
    // No new pick recorded — it read the existing one.
    expect(repo.recordedCalls.length).toBe(0);
  });
});

describe("DailyVerseService.getVerseOfTheDay", () => {
  const versions = {
    NASB1995: { id: "ver-nasb", language_code: "en-US" },
    VDC: { id: "ver-vdc", language_code: "ro-RO" },
  };

  it("renders verses + localized reference for the happy path", async () => {
    const repo = makeFakeRepo({
      active: [makeVerse("a", { book_id: 1, chapter_number: 1, verse_start: 1, verse_end: 2 })],
      versions,
      versesInRange: {
        "ver-nasb": [
          { verseNumber: 1, text: "In the beginning…" },
          { verseNumber: 2, text: "And the earth…" },
        ],
      },
      localizedBookName: "Genesis",
    });
    const service = new DailyVerseService({} as any, repo);
    const result = await service.getVerseOfTheDay({
      date: "2026-06-08",
      versionKey: "NASB1995",
      user: null,
    });
    expect(result.empty).toBe(false);
    if (result.empty) return;
    expect(result.verses).toHaveLength(2);
    expect(result.referenceText).toBe("Genesis 1:1-2");
    expect(result.versionKey).toBe("NASB1995");
  });

  it("falls back to NASB1995 verses missing in the requested version (D-29 safety net)", async () => {
    const repo = makeFakeRepo({
      active: [makeVerse("a", { verse_start: 1, verse_end: 2 })],
      versions,
      versesInRange: {
        "ver-vdc": [{ verseNumber: 1, text: "La început…" }], // missing v2
        "ver-nasb": [
          { verseNumber: 1, text: "In the beginning…" },
          { verseNumber: 2, text: "And the earth…" },
        ],
      },
      localizedBookName: "Geneza",
    });
    const service = new DailyVerseService({} as any, repo);
    const result = await service.getVerseOfTheDay({
      date: "2026-06-08",
      versionKey: "VDC",
      user: null,
    });
    if (result.empty) throw new Error("expected non-empty");
    expect(result.verses).toHaveLength(2);
    expect(result.verses[1].text).toBe("And the earth…"); // filled from NASB
  });

  it("flags missing book-name localization for non-English (D-30)", async () => {
    const repo = makeFakeRepo({
      active: [makeVerse("a")],
      versions,
      versesInRange: { "ver-vdc": [{ verseNumber: 1, text: "x" }] },
      localizedBookName: null, // no localized name
      canonicalBookName: "Genesis",
    });
    const service = new DailyVerseService({} as any, repo);
    const result = await service.getVerseOfTheDay({
      date: "2026-06-08",
      versionKey: "VDC",
      user: null,
    });
    if (result.empty) throw new Error("expected non-empty");
    expect(result.metrics.missingBookNameLocalization).toBe(true);
    expect(result.referenceText).toContain("Genesis");
  });

  it("returns empty payload when the pool is empty (D-25)", async () => {
    const repo = makeFakeRepo({ active: [], versions });
    const service = new DailyVerseService({} as any, repo);
    const result = await service.getVerseOfTheDay({
      date: "2026-06-08",
      versionKey: "NASB1995",
      user: null,
    });
    expect(result.empty).toBe(true);
    if (!result.empty) return;
    expect(result.fallbackMessage).toBeTruthy();
  });
});

describe("DailyVerseService.createCurated validation", () => {
  const baseInput = {
    book_id: 1,
    chapter_number: 1,
    verse_start: 1,
    verse_end: 2,
    tag_ids: [] as string[],
  };

  it("rejects a verse not present in the NASB1995 baseline (D-29)", async () => {
    const repo = makeFakeRepo({
      versions: { NASB1995: { id: "ver-nasb", language_code: "en-US" } },
      chapterId: 100,
      versesInRange: { "ver-nasb": [{ verseNumber: 1, text: "only v1" }] }, // v2 missing
    });
    const service = new DailyVerseService({} as any, repo);
    await expect(service.createCurated(baseInput)).rejects.toThrow();
  });

  it("rejects unknown tag ids (D-27)", async () => {
    const repo = makeFakeRepo({
      versions: { NASB1995: { id: "ver-nasb", language_code: "en-US" } },
      chapterId: 100,
      versesInRange: {
        "ver-nasb": [
          { verseNumber: 1, text: "v1" },
          { verseNumber: 2, text: "v2" },
        ],
      },
      knownTagIds: ["known-tag"],
    });
    const service = new DailyVerseService({} as any, repo);
    await expect(
      service.createCurated({ ...baseInput, tag_ids: ["unknown-tag"] }),
    ).rejects.toThrow();
  });

  it("rejects when the chapter does not exist (D-33 same-chapter / valid ref)", async () => {
    const repo = makeFakeRepo({
      versions: { NASB1995: { id: "ver-nasb", language_code: "en-US" } },
      chapterId: null,
    });
    const service = new DailyVerseService({} as any, repo);
    await expect(service.createCurated(baseInput)).rejects.toThrow();
  });
});
