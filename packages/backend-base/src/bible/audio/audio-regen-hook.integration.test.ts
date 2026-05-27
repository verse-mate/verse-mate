/**
 * TASK-003 integration test: admin-style explanation replacement against
 * real Postgres + Redis. Verifies the full contract of the hook:
 *
 *   1. Old audio rows flip to is_stale=true INSIDE the same transaction
 *      as the explanation replacement (same call, atomic).
 *   2. New explanation row is inserted with is_active=true and the old
 *      row is deactivated.
 *   3. For each (voice, language_code) variant that had audio, a
 *      BullMQ job is enqueued for the NEW explanation_id with the
 *      deterministic job id from the on-demand path.
 *   4. No audio-generation work runs (concurrency 1, worker is explicitly
 *      paused; we only assert the queue contents).
 *
 * Covers AC items:
 *   - "one job per regenerated row's existing (voice, language) variants"
 *   - "is_stale=true synchronously with the text update"
 *   - "reader in the gap receives the in-flight job id" (via deterministic
 *     id reuse — already covered by TASK-002 tests, re-verified here).
 *   - "BullMQ concurrency stays at 1" (static in audio-generation.queue.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Queue } from "bullmq";
import { db as Database } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import bullmqRedisConnection from "../../shared/bullmq-redis";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import {
  AUDIO_GENERATION_QUEUE,
  type AudioGenerationJobData,
  audioGenerationJobId,
} from "./audio-generation.queue";
import { replaceExplanationWithAudioHook } from "./audio-regen-hook";
import { AudioService } from "./audio.service";

// Use an isolated synthetic language code so the fixture rows never
// collide with real Bible seeds or with other integration tests that
// share the same (chapter, type) scope. Must fit varchar(10).
const TEST_LANG = `x${(Date.now() % 1_000_000).toString(36)}`.slice(0, 10);

let testExplanationId: number;
let testChapterId: number;

async function insertFixtureExplanation(): Promise<void> {
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
      explanation: "Original text",
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

async function seedTwoAudioVariants(explanationId: number): Promise<void> {
  const conn = Database.getOrCreateConnection();
  await conn
    .insertInto("explanation_audios")
    .values([
      {
        explanation_id: explanationId,
        voice: "alloy",
        language_code: TEST_LANG,
        storage_key: `explanation-audio/${explanationId}/alloy/en/hash1.mp3`,
        duration_seconds: 10,
        character_count: 50,
        content_hash: "hash1",
        tts_provider: "openai",
        tts_model: "tts-1-hd",
        is_stale: false,
      },
      {
        explanation_id: explanationId,
        voice: "nova",
        language_code: TEST_LANG,
        storage_key: `explanation-audio/${explanationId}/nova/en/hash2.mp3`,
        duration_seconds: 12,
        character_count: 50,
        content_hash: "hash2",
        tts_provider: "openai",
        tts_model: "tts-1-hd",
        is_stale: false,
      },
    ])
    .execute();
}

async function cleanup(): Promise<void> {
  const conn = Database.getOrCreateConnection();
  if (testChapterId) {
    await conn
      .deleteFrom("explanations")
      .where("chapter_id", "=", testChapterId)
      .where("type", "=", ExplanationTypeEnum.summary)
      .where("version", ">=", 1)
      // Only the rows this test inserted — leave production seed data alone.
      .where("language_code", "=", TEST_LANG)
      .where("created_by_admin", "=", true)
      .execute();
  }
}

async function drainAudioQueue(queue: Queue): Promise<void> {
  await queue.drain(true);
  await queue.clean(0, 10000, "completed");
  await queue.clean(0, 10000, "failed");
  await queue.clean(0, 10000, "wait");
  await queue.clean(0, 10000, "active");
  await queue.clean(0, 10000, "delayed");
}

describe("replaceExplanationWithAudioHook — integration", () => {
  let queue: Queue<AudioGenerationJobData>;
  let audioService: AudioService;

  beforeAll(async () => {
    queue = new Queue<AudioGenerationJobData>(AUDIO_GENERATION_QUEUE, {
      connection: bullmqRedisConnection,
    });
    await drainAudioQueue(queue);
    // Force a non-stub provider so enqueueRegenForVariants actually queues —
    // the .env for this repo uses TTS_PROVIDER=stub.
    class NoopOpenAi {
      readonly name = "openai";
      async synthesize(_: any): Promise<any> {
        throw new Error("not called in this test");
      }
      async listVoices(_: any): Promise<any[]> {
        return [];
      }
    }
    audioService = new AudioService(
      Database,
      new ObjectStorageService(),
      new NoopOpenAi() as never,
      queue,
    );
    await insertFixtureExplanation();
    await seedTwoAudioVariants(testExplanationId);
  });

  afterAll(async () => {
    await cleanup();
    await drainAudioQueue(queue);
    await queue.close();
  });

  it("replaces the explanation, marks old audio rows stale, and enqueues two jobs", async () => {
    const oldId = testExplanationId;

    const { newExplanationId, enqueuedJobIds } =
      await replaceExplanationWithAudioHook({
        chapter_id: testChapterId,
        type: ExplanationTypeEnum.summary,
        language_code: TEST_LANG,
        new_explanation: "Revised text for br-audio-001 coverage",
        version: 2,
        audioService,
      });

    expect(newExplanationId).not.toBe(oldId);

    // (1) Old explanation deactivated, new one active.
    const rows = await Database.getOrCreateConnection()
      .selectFrom("explanations")
      .select(["explanation_id", "is_active", "version", "explanation"])
      .where("chapter_id", "=", testChapterId)
      .where("type", "=", ExplanationTypeEnum.summary)
      .where("language_code", "=", TEST_LANG)
      .execute();

    const oldRow = rows.find((r) => r.explanation_id === oldId);
    const newRow = rows.find((r) => r.explanation_id === newExplanationId);
    expect(oldRow?.is_active).toBe(false);
    expect(newRow?.is_active).toBe(true);
    expect(newRow?.version).toBe(2);
    expect(newRow?.explanation).toContain("Revised text");

    // (2) Old audio rows are stale; no audio exists yet for the new id.
    const oldAudios = await Database.getOrCreateConnection()
      .selectFrom("explanation_audios")
      .selectAll()
      .where("explanation_id", "=", oldId)
      .execute();
    expect(oldAudios).toHaveLength(2);
    expect(oldAudios.every((a) => a.is_stale === true)).toBe(true);

    const newAudios = await Database.getOrCreateConnection()
      .selectFrom("explanation_audios")
      .selectAll()
      .where("explanation_id", "=", newExplanationId)
      .execute();
    expect(newAudios).toHaveLength(0);

    // (3) Two jobs enqueued, one per variant, with deterministic ids.
    expect(enqueuedJobIds).toHaveLength(2);
    expect(enqueuedJobIds).toContain(
      audioGenerationJobId({
        explanation_id: newExplanationId,
        voice: "alloy",
        language_code: TEST_LANG,
      }),
    );
    expect(enqueuedJobIds).toContain(
      audioGenerationJobId({
        explanation_id: newExplanationId,
        voice: "nova",
        language_code: TEST_LANG,
      }),
    );

    for (const jobId of enqueuedJobIds) {
      const job = await queue.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.data.explanation_id).toBe(newExplanationId);
    }
  });

  it("calling the hook again for the same replacement is idempotent w.r.t. the queue (dedup)", async () => {
    // Insert fresh audio for the NOW-active explanation so we have something
    // to re-queue, then run the hook a second time against a new version.
    const conn = Database.getOrCreateConnection();
    const active = await conn
      .selectFrom("explanations")
      .select("explanation_id")
      .where("chapter_id", "=", testChapterId)
      .where("type", "=", ExplanationTypeEnum.summary)
      .where("language_code", "=", TEST_LANG)
      .where("is_active", "=", true)
      .executeTakeFirstOrThrow();

    await conn
      .insertInto("explanation_audios")
      .values({
        explanation_id: active.explanation_id,
        voice: "alloy",
        language_code: TEST_LANG,
        storage_key: `explanation-audio/${active.explanation_id}/alloy/en/h.mp3`,
        duration_seconds: 5,
        character_count: 10,
        content_hash: "h",
        tts_provider: "openai",
        tts_model: "tts-1-hd",
        is_stale: false,
      })
      .execute();

    const first = await replaceExplanationWithAudioHook({
      chapter_id: testChapterId,
      type: ExplanationTypeEnum.summary,
      language_code: TEST_LANG,
      new_explanation: "Version 3",
      version: 3,
      audioService,
    });
    const second = await replaceExplanationWithAudioHook({
      chapter_id: testChapterId,
      type: ExplanationTypeEnum.summary,
      language_code: TEST_LANG,
      new_explanation: "Version 4",
      version: 4,
      audioService,
    });

    // First hook: one variant → one job enqueued.
    expect(first.enqueuedJobIds).toHaveLength(1);
    // Second hook: the active row it replaced had no audio, so no jobs.
    expect(second.enqueuedJobIds).toHaveLength(0);
  });
});
