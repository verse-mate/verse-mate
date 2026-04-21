/**
 * Integration tests for TASK-002 reader path.
 *
 * Exercises the full service → TtsProvider → ObjectStorageService → DB chain
 * against running Postgres + Redis + MinIO (from docker-compose.yml).
 *
 * Requires:
 *   - docker compose up -d postgres redis minio
 *   - OBJECT_STORAGE_* env vars matching the container credentials (the
 *     .env defaults in this repo already do).
 *
 * The OpenAI variant at the bottom is gated on RUN_OPENAI_TTS_IT=1 to
 * avoid billing during routine test runs — same convention TASK-001
 * introduced for the OpenAiTtsProvider contract test.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { Queue } from "bullmq";
import { db as Database } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import bullmqRedisConnection from "../../shared/bullmq-redis";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import { OpenAiTtsProvider } from "../../shared/tts/providers/openai-tts.provider";
import { StubTtsProvider } from "../../shared/tts/providers/stub-tts.provider";
import {
  AUDIO_GENERATION_QUEUE,
  type AudioGenerationJobData,
} from "./audio-generation.queue";
import { AudioService } from "./audio.service";

const BUCKET = process.env.OBJECT_STORAGE_BUCKET ?? "saas-starter-dev";

// The fixture MP3 lives under apps/backend (TASK-001 decision — it's the
// deployable unit's fixture). Tests run from packages/backend-base, so
// resolve to an absolute path.
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "../../../../../apps/backend/fixtures/explanation-audio-stub.mp3",
);

// A small amount of Bible text so real synthesis stays cheap and the
// stub fixture is plausibly applicable.
const TEST_TEXT =
  "In the beginning God created the heavens and the earth. The earth was without form and void.";

let testExplanationId: number;

async function ensureBucket(): Promise<void> {
  // Bucket creation is handled by the `minio-setup` one-shot container in
  // docker-compose.yml. This helper just verifies it's reachable so a
  // forgotten `docker compose up` surfaces clearly instead of via an
  // opaque upload failure 20 lines later.
  const endpoint =
    process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:9000";
  const response = await fetch(`${endpoint}/minio/health/live`);
  if (!response.ok) {
    throw new Error(
      `MinIO is not healthy at ${endpoint} — run \`docker compose up -d minio minio-setup\``,
    );
  }
}

async function insertFixtureExplanation(): Promise<void> {
  const conn = Database.getOrCreateConnection();

  // Resolve an existing Genesis 1 chapter to satisfy the FK and the
  // guest-scope rule (br-audio-013).
  const chapter = await conn
    .selectFrom("chapters")
    .select(["chapter_id", "book_id", "chapter_number"])
    .where("book_id", "=", 1)
    .where("chapter_number", "=", 1)
    .executeTakeFirstOrThrow();

  const inserted = await conn
    .insertInto("explanations")
    .values({
      type: ExplanationTypeEnum.summary,
      explanation: TEST_TEXT,
      chapter_id: chapter.chapter_id,
      version: 1,
      is_active: true,
      created_by_admin: true,
      parent_explanation_id: null,
      language_code: "en",
    })
    .returning(["explanation_id"])
    .executeTakeFirstOrThrow();

  testExplanationId = inserted.explanation_id;
}

async function cleanupFixtureAndAudios(): Promise<void> {
  if (!testExplanationId) return;
  const conn = Database.getOrCreateConnection();
  // cascade delete drops explanation_audios rows too, but be explicit in
  // case the cascade is disabled in some environment.
  await conn
    .deleteFrom("explanation_audios")
    .where("explanation_id", "=", testExplanationId)
    .execute();
  await conn
    .deleteFrom("explanations")
    .where("explanation_id", "=", testExplanationId)
    .execute();
}

describe("AudioService — integration (MinIO + Postgres + Redis)", () => {
  let storage: ObjectStorageService;
  let queue: Queue<AudioGenerationJobData>;

  beforeAll(async () => {
    await ensureBucket();
    storage = new ObjectStorageService();

    queue = new Queue<AudioGenerationJobData>(AUDIO_GENERATION_QUEUE, {
      connection: bullmqRedisConnection,
    });

    await insertFixtureExplanation();
  });

  afterAll(async () => {
    await cleanupFixtureAndAudios();
    await queue.close();
  });

  describe("stub provider (CI-safe — always on)", () => {
    it("synthesize → upload → upsert → ready with resolvable presigned URL", async () => {
      const service = new AudioService(
        Database,
        storage,
        new StubTtsProvider({ fixturePath: FIXTURE_PATH }),
        queue,
      );

      const result = await service.getOrQueueAudio({
        explanation_id: testExplanationId,
        voice: "stub",
        language: "en",
        currentUserId: "integration-user-1",
      });

      expect(result.kind).toBe("ready");
      if (result.kind !== "ready") throw new Error("expected ready");

      // br-audio-007: reader payload is the narrow four-field shape.
      expect(result.audio).not.toHaveProperty("tts_provider");
      expect(result.audio).not.toHaveProperty("storage_key");
      expect(result.audio.voice).toBe("stub");
      expect(result.audio.language_code).toBe("en");
      expect(result.audio.url).toContain(BUCKET);
      expect(result.audio.url).toContain(
        `explanation-audio/${testExplanationId}/stub/en/`,
      );

      // Verify the presigned URL actually resolves to the object we just
      // uploaded.
      const response = await fetch(result.audio.url);
      expect(response.status).toBe(200);
      const body = await response.arrayBuffer();
      expect(body.byteLength).toBeGreaterThan(0);
    });

    it("second call is a cache hit, no additional upload", async () => {
      const service = new AudioService(
        Database,
        storage,
        new StubTtsProvider({ fixturePath: FIXTURE_PATH }),
        queue,
      );

      const first = await service.getOrQueueAudio({
        explanation_id: testExplanationId,
        voice: "stub",
        language: "en",
        currentUserId: "integration-user-1",
      });
      const second = await service.getOrQueueAudio({
        explanation_id: testExplanationId,
        voice: "stub",
        language: "en",
        currentUserId: "integration-user-1",
      });

      expect(first.kind).toBe("ready");
      expect(second.kind).toBe("ready");
      if (first.kind !== "ready" || second.kind !== "ready") return;
      // Reader DTO has no audio_id/storage_key — compare the opaque URL
      // path (content_hash-suffixed filename proves both calls hit the
      // same cached row).
      expect(first.audio.url.split("?")[0]).toBe(
        second.audio.url.split("?")[0],
      );
    });

    it("guest on Genesis 1 is allowed (integration path)", async () => {
      const service = new AudioService(
        Database,
        storage,
        new StubTtsProvider({ fixturePath: FIXTURE_PATH }),
        queue,
      );

      const result = await service.getOrQueueAudio({
        explanation_id: testExplanationId,
        voice: "stub",
        language: "en",
        currentUserId: null,
      });
      expect(result.kind).toBe("ready");
    });
  });

  // ------------------------------------------------------------------
  // OpenAI variant — gated, same convention as tts-provider.test.ts
  // ------------------------------------------------------------------
  const runOpenAi =
    process.env.RUN_OPENAI_TTS_IT === "1" && Boolean(process.env.OPEN_AI_KEY);
  const describeOpenAi = runOpenAi ? describe : describe.skip;

  describeOpenAi("openai provider (opt-in: RUN_OPENAI_TTS_IT=1)", () => {
    it("synthesize → upload → upsert → ready with resolvable URL", async () => {
      const service = new AudioService(
        Database,
        storage,
        new OpenAiTtsProvider(),
        queue,
      );

      const result = await service.getOrQueueAudio({
        explanation_id: testExplanationId,
        voice: "alloy",
        language: "en",
        currentUserId: "integration-user-openai",
      });

      // For the OpenAI path the service returns 202 (queued) — the worker
      // is what performs synthesis. To keep the test hermetic we drive the
      // worker's core work through the service directly.
      expect(result.kind).toBe("queued");

      const row = await service.synthesizeAndStore(TEST_TEXT, {
        explanation_id: testExplanationId,
        voice: "alloy",
        language_code: "en",
      });
      expect(row.tts_provider).toBe("openai");
      expect(row.duration_seconds).toBeGreaterThan(0);
      expect(row.content_hash).toHaveLength(64);

      const url = await storage.getGlobalObjectUrl({ key: row.storage_key });
      const response = await fetch(url);
      expect(response.status).toBe(200);
      const body = await response.arrayBuffer();
      expect(body.byteLength).toBeGreaterThan(500);
    });
  });
});
