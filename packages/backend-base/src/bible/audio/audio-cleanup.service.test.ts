/**
 * TASK-004 unit tests — AudioCleanupService with mocked repo + storage.
 *
 * Covers every AC branch:
 *   - success path (storage delete OK → DB delete OK → counted as deleted)
 *   - storage failure (deleteObject returns false → DB row kept, counted failed)
 *   - DB failure after storage success (counted failed, retry next run)
 *   - empty result (no stale rows → 0/0/0)
 *   - filter correctness (only rows the repository returns are touched —
 *     the repo's `listStale(cutoff)` is the source of truth for br-audio-002)
 *   - batch size cap
 */
import { beforeEach, describe, expect, it } from "bun:test";
import type { ExplanationAudios } from "database/src/models/public/ExplanationAudios";
import type { ObjectStorageService } from "../../shared/storage/storage.service";
import { AudioCleanupService } from "./audio-cleanup.service";
import { AudioRepository } from "./audio.repository";

class FakeRepository extends AudioRepository {
  public rows: ExplanationAudios[] = [];
  public deleted: string[] = [];
  public listStaleCalls: Date[] = [];
  public throwOnDeleteIds = new Set<string>();

  constructor() {
    super({} as any);
  }

  async listStale(olderThan: Date): Promise<ExplanationAudios[]> {
    this.listStaleCalls.push(olderThan);
    return this.rows.filter(
      (r) => r.is_stale === true && new Date(r.generated_at) < olderThan,
    );
  }

  async deleteById(audioId: string): Promise<void> {
    if (this.throwOnDeleteIds.has(audioId)) {
      throw new Error(`simulated DB delete failure for ${audioId}`);
    }
    this.deleted.push(audioId);
    this.rows = this.rows.filter((r) => r.audio_id !== audioId);
  }
}

class FakeStorage {
  public deletedKeys: string[] = [];
  public failOnKeys = new Set<string>();

  async deleteObject(key: string): Promise<boolean> {
    if (this.failOnKeys.has(key)) return false;
    this.deletedKeys.push(key);
    return true;
  }
}

class CapturingLogger {
  public infos: Array<{ msg: string; meta?: Record<string, unknown> }> = [];
  public errors: Array<{ msg: string; meta?: Record<string, unknown> }> = [];

  info(msg: string, meta?: Record<string, unknown>) {
    this.infos.push({ msg, meta });
  }
  error(msg: string, meta?: Record<string, unknown>) {
    this.errors.push({ msg, meta });
  }
}

function makeRow(
  audio_id: string,
  overrides: Partial<ExplanationAudios> = {},
): ExplanationAudios {
  return {
    audio_id,
    explanation_id: 1,
    voice: "alloy",
    language_code: "en",
    storage_key: `k/${audio_id}.mp3`,
    duration_seconds: 5,
    character_count: 50,
    content_hash: "h",
    tts_provider: "openai",
    tts_model: "tts-1-hd",
    is_stale: true,
    generated_at: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
    ...overrides,
  };
}

describe("AudioCleanupService", () => {
  let repo: FakeRepository;
  let storage: FakeStorage;
  let logger: CapturingLogger;

  beforeEach(() => {
    repo = new FakeRepository();
    storage = new FakeStorage();
    logger = new CapturingLogger();
  });

  function makeService() {
    return new AudioCleanupService(
      {} as never,
      storage as unknown as ObjectStorageService,
      logger,
      repo,
    );
  }

  it("empty set → 0 deleted, 0 failed", async () => {
    const service = makeService();
    const result = await service.runCleanup();

    expect(result.scanned_count).toBe(0);
    expect(result.deleted_count).toBe(0);
    expect(result.failed_count).toBe(0);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(storage.deletedKeys).toEqual([]);
  });

  it("all rows succeed: storage + DB deletes run, counters correct", async () => {
    repo.rows = [makeRow("a1"), makeRow("a2"), makeRow("a3")];

    const result = await makeService().runCleanup();

    expect(result.scanned_count).toBe(3);
    expect(result.deleted_count).toBe(3);
    expect(result.failed_count).toBe(0);
    expect(storage.deletedKeys).toEqual(["k/a1.mp3", "k/a2.mp3", "k/a3.mp3"]);
    expect(repo.deleted).toEqual(["a1", "a2", "a3"]);
    expect(repo.rows).toHaveLength(0);
  });

  it("storage failure keeps DB row and counts it as failed", async () => {
    repo.rows = [makeRow("a1"), makeRow("a2")];
    storage.failOnKeys.add("k/a1.mp3");

    const result = await makeService().runCleanup();

    expect(result.deleted_count).toBe(1);
    expect(result.failed_count).toBe(1);
    expect(storage.deletedKeys).toEqual(["k/a2.mp3"]);
    expect(repo.deleted).toEqual(["a2"]);
    // a1 is still in the DB so the next run can retry.
    expect(repo.rows.map((r) => r.audio_id)).toEqual(["a1"]);
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0].meta?.audio_id).toBe("a1");
  });

  it("DB failure after storage success is counted as failed (next run retries)", async () => {
    repo.rows = [makeRow("a1"), makeRow("a2")];
    repo.throwOnDeleteIds.add("a1");

    const result = await makeService().runCleanup();

    expect(result.deleted_count).toBe(1);
    expect(result.failed_count).toBe(1);
    expect(storage.deletedKeys).toEqual(["k/a1.mp3", "k/a2.mp3"]);
    expect(repo.deleted).toEqual(["a2"]);
    expect(logger.errors[0].msg).toContain("DB delete failed");
  });

  it("never touches rows the repository doesn't return (is_stale=false or recent)", async () => {
    // Repository filters by (is_stale = true AND generated_at < cutoff).
    // These rows don't qualify and shouldn't surface to the service.
    repo.rows = [
      makeRow("fresh-stale", {
        is_stale: true,
        generated_at: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago
      }),
      makeRow("old-active", {
        is_stale: false,
        generated_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
      }),
      makeRow("old-stale", {
        is_stale: true,
        generated_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
      }),
    ];

    const result = await makeService().runCleanup();

    expect(result.scanned_count).toBe(1);
    expect(result.deleted_count).toBe(1);
    expect(storage.deletedKeys).toEqual(["k/old-stale.mp3"]);
    expect(repo.rows.map((r) => r.audio_id).sort()).toEqual([
      "fresh-stale",
      "old-active",
    ]);
  });

  it("respects batchSize cap", async () => {
    repo.rows = Array.from({ length: 5 }, (_, i) => makeRow(`a${i}`));

    const result = await makeService().runCleanup({ batchSize: 2 });

    expect(result.scanned_count).toBe(2);
    expect(result.deleted_count).toBe(2);
    expect(repo.rows).toHaveLength(3);
  });

  it("emits AUDIO_CLEANUP_RAN with all three counters", async () => {
    repo.rows = [makeRow("a1"), makeRow("a2")];
    storage.failOnKeys.add("k/a1.mp3");

    await makeService().runCleanup();

    const event = logger.infos.find(
      (i) => i.meta?.event === "AUDIO_CLEANUP_RAN",
    );
    expect(event).toBeDefined();
    expect(event?.meta?.scanned_count).toBe(2);
    expect(event?.meta?.deleted_count).toBe(1);
    expect(event?.meta?.failed_count).toBe(1);
    expect(typeof event?.meta?.duration_ms).toBe("number");
  });

  it("idempotent: second run on same state sees nothing", async () => {
    repo.rows = [makeRow("a1")];
    const service = makeService();

    const first = await service.runCleanup();
    const second = await service.runCleanup();

    expect(first.deleted_count).toBe(1);
    expect(second.scanned_count).toBe(0);
    expect(second.deleted_count).toBe(0);
    expect(second.failed_count).toBe(0);
  });
});
