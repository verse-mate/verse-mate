/**
 * TASK-004 integration test — runs AudioCleanupService against real
 * Postgres + MinIO. Verifies the three AC rules that only surface at the
 * infra boundary:
 *
 *   1. The row the cleanup SELECT actually fires against is stale AND old.
 *      We seed three rows (one stale+old, one stale+recent, one active+old)
 *      and assert only the stale+old row is removed from DB + object store.
 *   2. After one run, a second run is a no-op (idempotent).
 *   3. The object store really sees the delete (HeadObject-style check via
 *      a second presigned GET that should 404).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { db as Database } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import { AudioCleanupService } from "./audio-cleanup.service";

const BUCKET = process.env.OBJECT_STORAGE_BUCKET ?? "saas-starter-dev";
const TEST_LANG = `y${(Date.now() % 1_000_000).toString(36)}`.slice(0, 10);

let testExplanationId: number;
let testChapterId: number;
let storage: ObjectStorageService;

async function ensureMinioHealthy(): Promise<void> {
  const endpoint =
    process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:9000";
  const resp = await fetch(`${endpoint}/minio/health/live`);
  if (!resp.ok) {
    throw new Error(
      `MinIO not healthy at ${endpoint} — run \`docker compose up -d minio minio-setup\``,
    );
  }
}

async function seed(): Promise<void> {
  const conn = Database.getOrCreateConnection();
  const chapter = await conn
    .selectFrom("chapters")
    .select(["chapter_id"])
    .where("book_id", "=", 1)
    .where("chapter_number", "=", 1)
    .executeTakeFirstOrThrow();
  testChapterId = chapter.chapter_id;

  const inserted = await conn
    .insertInto("explanations")
    .values({
      type: ExplanationTypeEnum.summary,
      explanation: "Cleanup test explanation",
      chapter_id: chapter.chapter_id,
      version: 1,
      is_active: true,
      created_by_admin: true,
      parent_explanation_id: null,
      language_code: TEST_LANG,
    })
    .returning(["explanation_id"])
    .executeTakeFirstOrThrow();
  testExplanationId = inserted.explanation_id;
}

async function uploadFixture(key: string): Promise<void> {
  await storage.putGlobalObject({
    key,
    body: Buffer.from(`audio-bytes-for-${key}`),
    contentType: "audio/mpeg",
  });
}

async function seedAudio(
  label: string,
  opts: { is_stale: boolean; hoursAgo: number; voice: string },
): Promise<{ audio_id: string; storage_key: string; label: string }> {
  const audio_id = randomUUID();
  const key = `explanation-audio/${testExplanationId}/${opts.voice}/${TEST_LANG}/${label}.mp3`;
  await uploadFixture(key);
  await Database.getOrCreateConnection()
    .insertInto("explanation_audios")
    .values({
      audio_id,
      explanation_id: testExplanationId,
      voice: opts.voice,
      language_code: TEST_LANG,
      storage_key: key,
      duration_seconds: 5,
      character_count: 10,
      content_hash: `h-${label}`,
      tts_provider: "openai",
      tts_model: "tts-1-hd",
      is_stale: opts.is_stale,
      generated_at: new Date(Date.now() - opts.hoursAgo * 60 * 60 * 1000),
    })
    .execute();
  return { audio_id, storage_key: key, label };
}

async function cleanup(): Promise<void> {
  const conn = Database.getOrCreateConnection();
  await conn
    .deleteFrom("explanation_audios")
    .where("explanation_id", "=", testExplanationId)
    .execute();
  await conn
    .deleteFrom("explanations")
    .where("explanation_id", "=", testExplanationId)
    .execute();
}

describe("AudioCleanupService — integration (Postgres + MinIO)", () => {
  let staleOld: { audio_id: string; storage_key: string };
  let staleRecent: { audio_id: string; storage_key: string };
  let activeOld: { audio_id: string; storage_key: string };

  beforeAll(async () => {
    await ensureMinioHealthy();
    storage = new ObjectStorageService();
    await seed();

    staleOld = await seedAudio("stale-old", {
      is_stale: true,
      hoursAgo: 48,
      voice: "alloy",
    });
    staleRecent = await seedAudio("stale-recent", {
      is_stale: true,
      hoursAgo: 1,
      voice: "nova",
    });
    activeOld = await seedAudio("active-old", {
      is_stale: false,
      hoursAgo: 48,
      voice: "shimmer",
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("deletes only stale+old rows from DB and object store", async () => {
    const service = new AudioCleanupService(Database, storage);
    const result = await service.runCleanup();

    expect(result.scanned_count).toBe(1);
    expect(result.deleted_count).toBe(1);
    expect(result.failed_count).toBe(0);

    // DB: only the stale-old row is gone.
    const remaining = await Database.getOrCreateConnection()
      .selectFrom("explanation_audios")
      .select("audio_id")
      .where("explanation_id", "=", testExplanationId)
      .execute();
    const remainingIds = remaining.map((r) => r.audio_id).sort();
    expect(remainingIds).toEqual(
      [activeOld.audio_id, staleRecent.audio_id].sort(),
    );

    // Object store: the stale-old key is gone; others are still present.
    const deletedResp = await fetch(
      await storage.getGlobalObjectUrl({ key: staleOld.storage_key }),
    );
    expect(deletedResp.status).toBe(404);

    const staleRecentResp = await fetch(
      await storage.getGlobalObjectUrl({ key: staleRecent.storage_key }),
    );
    expect(staleRecentResp.status).toBe(200);

    const activeOldResp = await fetch(
      await storage.getGlobalObjectUrl({ key: activeOld.storage_key }),
    );
    expect(activeOldResp.status).toBe(200);
  });

  it("second run on the same state is idempotent (nothing to scan)", async () => {
    const service = new AudioCleanupService(Database, storage);
    const result = await service.runCleanup();

    expect(result.scanned_count).toBe(0);
    expect(result.deleted_count).toBe(0);
    expect(result.failed_count).toBe(0);
  });
});
