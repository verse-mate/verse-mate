import { beforeEach, describe, expect, it } from "bun:test";
import type { Queue } from "bullmq";
import type { ExplanationAudios } from "database/src/models/public/ExplanationAudios";
import { NotFoundError, UnauthorizedError } from "../../common/errors";
import type { ObjectStorageService } from "../../shared/storage/storage.service";
import type {
  SynthesizeInput,
  SynthesizeOutput,
  TtsProvider,
  Voice,
} from "../../shared/tts/tts-provider.interface";
import type { AudioGenerationJobData } from "./audio-generation.queue";
import {
  AudioRepository,
  contentHashOf,
  storageKeyFor,
} from "./audio.repository";
import { AudioService } from "./audio.service";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

class FakeRepository extends AudioRepository {
  public rows: ExplanationAudios[] = [];
  public upsertCalls = 0;

  constructor() {
    super({} as never);
  }

  async findCurrent(key: {
    explanation_id: number;
    voice: string;
    language_code: string;
  }): Promise<ExplanationAudios | undefined> {
    return this.rows.find(
      (r) =>
        r.explanation_id === key.explanation_id &&
        r.voice === key.voice &&
        r.language_code === key.language_code,
    );
  }

  async findById(audioId: string): Promise<ExplanationAudios | undefined> {
    return this.rows.find((r) => r.audio_id === audioId);
  }

  async upsert(
    row: Parameters<AudioRepository["upsert"]>[0],
  ): Promise<ExplanationAudios> {
    this.upsertCalls += 1;
    const created: ExplanationAudios = {
      audio_id: `audio-${this.rows.length + 1}`,
      explanation_id: row.explanation_id,
      voice: row.voice,
      language_code: row.language_code,
      storage_key: row.storage_key,
      duration_seconds: row.duration_seconds,
      character_count: row.character_count,
      content_hash: row.content_hash,
      tts_provider: row.tts_provider,
      tts_model: row.tts_model,
      is_stale: row.is_stale ?? false,
      generated_at: new Date(),
    };
    // Replace matching variant (mirrors the real upsert semantics)
    this.rows = this.rows.filter(
      (r) =>
        !(
          r.explanation_id === created.explanation_id &&
          r.voice === created.voice &&
          r.language_code === created.language_code
        ),
    );
    this.rows.push(created);
    return created;
  }
}

class FakeStorage {
  public uploaded: { key: string; size: number; contentType: string }[] = [];

  async putGlobalObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    this.uploaded.push({
      key: input.key,
      size: input.body.byteLength,
      contentType: input.contentType,
    });
  }

  async getGlobalObjectUrl(input: { key: string }): Promise<string> {
    return `https://storage.test/${input.key}?sig=fake`;
  }

  async deleteObject(_key: string): Promise<boolean> {
    return true;
  }
}

class FakeStubProvider implements TtsProvider {
  readonly name = "stub";
  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    return {
      audio: Buffer.from("stub-audio-bytes"),
      duration_seconds: 5,
      character_count: input.text.length,
      model_version: "stub-fixture",
    };
  }
  async listVoices(language: string): Promise<Voice[]> {
    return [{ id: "stub", language, label: "Stub" }];
  }
}

class FakeOpenAiProvider implements TtsProvider {
  readonly name = "openai";
  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    return {
      audio: Buffer.from("openai-audio-bytes"),
      duration_seconds: 6,
      character_count: input.text.length,
      model_version: "tts-1-hd",
    };
  }
  async listVoices(language: string): Promise<Voice[]> {
    return [{ id: "alloy", language, label: "Alloy" }];
  }
}

class FakeJob {
  public returnvalue?: { audio_id: string };
  public failedReason?: string;
  private state: "queued" | "active" | "completed" | "failed" = "queued";

  constructor(public readonly id: string) {}

  complete(audioId: string) {
    this.state = "completed";
    this.returnvalue = { audio_id: audioId };
  }

  fail(reason: string) {
    this.state = "failed";
    this.failedReason = reason;
  }

  async getState() {
    return this.state;
  }

  async isCompleted() {
    return this.state === "completed";
  }

  async isFailed() {
    return this.state === "failed";
  }
}

class FakeQueue {
  public jobs = new Map<string, FakeJob>();
  public addCalls: {
    name: string;
    data: AudioGenerationJobData;
    jobId: string;
  }[] = [];

  async getJob(jobId: string): Promise<FakeJob | undefined> {
    return this.jobs.get(jobId);
  }

  async add(
    name: string,
    data: AudioGenerationJobData,
    opts: { jobId: string },
  ): Promise<FakeJob> {
    this.addCalls.push({ name, data, jobId: opts.jobId });
    const job = new FakeJob(opts.jobId);
    this.jobs.set(opts.jobId, job);
    return job;
  }
}

// ---------------------------------------------------------------------------
// Minimal Kysely-shape db fake. Only the queries AudioService.loadExplanation
// and isGuestAllowed invoke need to work.
// ---------------------------------------------------------------------------

type ExplanationRow = {
  explanation_id: number;
  explanation: string;
  chapter_id: number;
  language_code: string;
};
type ChapterRow = {
  chapter_id: number;
  book_id: number;
  chapter_number: number;
};

function makeFakeDb(params: {
  explanations: ExplanationRow[];
  chapters: ChapterRow[];
}) {
  function selectFrom(table: "explanations" | "chapters") {
    const rows: Array<ExplanationRow | ChapterRow> =
      table === "explanations"
        ? [...params.explanations]
        : [...params.chapters];
    let filtered = rows;
    const api: any = {
      select: () => api,
      selectAll: () => api,
      where: (col: string, _op: string, val: unknown) => {
        filtered = filtered.filter((r: any) => r[col] === val);
        return api;
      },
      executeTakeFirst: async () => filtered[0],
      executeTakeFirstOrThrow: async () => {
        if (!filtered[0]) throw new Error("no row");
        return filtered[0];
      },
      execute: async () => filtered,
    };
    return api;
  }

  return {
    getOrCreateConnection: () => ({ selectFrom }),
  } as never;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AudioService", () => {
  const explanation: ExplanationRow = {
    explanation_id: 42,
    explanation: "In the beginning God created the heavens and the earth.",
    chapter_id: 1,
    language_code: "en",
  };
  const genesis1: ChapterRow = {
    chapter_id: 1,
    book_id: 1,
    chapter_number: 1,
  };
  const genesis2: ChapterRow = {
    chapter_id: 2,
    book_id: 1,
    chapter_number: 2,
  };

  let repo: FakeRepository;
  let storage: FakeStorage;
  let queue: FakeQueue;

  beforeEach(() => {
    repo = new FakeRepository();
    storage = new FakeStorage();
    queue = new FakeQueue();
  });

  function makeService(
    provider: TtsProvider = new FakeOpenAiProvider(),
    chapters: ChapterRow[] = [genesis1],
    explanations: ExplanationRow[] = [explanation],
  ) {
    const db = makeFakeDb({ explanations, chapters });
    return new AudioService(
      db,
      storage as unknown as ObjectStorageService,
      provider,
      queue as unknown as Queue<AudioGenerationJobData>,
      repo,
    );
  }

  describe("cache hit", () => {
    it("returns ready with presigned URL when a non-stale row exists", async () => {
      const service = makeService();
      await repo.upsert({
        explanation_id: 42,
        voice: "alloy",
        language_code: "en",
        storage_key: "explanation-audio/42/alloy/en/hash.mp3",
        duration_seconds: 10,
        character_count: 50,
        content_hash: "hash",
        tts_provider: "openai",
        tts_model: "tts-1-hd",
        is_stale: false,
      });

      const result = await service.getOrQueueAudio({
        explanation_id: 42,
        voice: "alloy",
        currentUserId: "u-1",
      });

      expect(result.kind).toBe("ready");
      if (result.kind === "ready") {
        expect(result.audio.url).toContain(
          "explanation-audio/42/alloy/en/hash.mp3",
        );
        expect(result.audio.voice).toBe("alloy");
        expect(result.audio.duration_seconds).toBe(10);
      }
      expect(queue.addCalls.length).toBe(0);
    });

    it("treats is_stale=true as miss and re-queues", async () => {
      const service = makeService();
      await repo.upsert({
        explanation_id: 42,
        voice: "alloy",
        language_code: "en",
        storage_key: "explanation-audio/42/alloy/en/hash.mp3",
        duration_seconds: 10,
        character_count: 50,
        content_hash: "hash",
        tts_provider: "openai",
        tts_model: "tts-1-hd",
        is_stale: true,
      });

      const result = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });

      expect(result.kind).toBe("queued");
      expect(queue.addCalls.length).toBe(1);
    });
  });

  describe("dedup (br-audio-006)", () => {
    it("two concurrent misses for the same variant enqueue ONE job", async () => {
      const service = makeService();
      const first = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });
      const second = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });

      expect(first.kind).toBe("queued");
      expect(second.kind).toBe("queued");
      if (first.kind === "queued" && second.kind === "queued") {
        expect(first.job.job_id).toBe(second.job.job_id);
      }
      expect(queue.addCalls.length).toBe(1);
    });

    it("re-enqueues if the previous job failed", async () => {
      const service = makeService();
      const first = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });
      expect(first.kind).toBe("queued");
      if (first.kind === "queued") {
        queue.jobs.get(first.job.job_id)?.fail("synth died");
      }

      const second = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });
      expect(second.kind).toBe("queued");
      expect(queue.addCalls.length).toBe(2);
    });
  });

  describe("stub short-circuit (br-audio-007)", () => {
    it("synthesizes inline, uploads to storage, upserts row, and creates NO queue job", async () => {
      const service = makeService(new FakeStubProvider());

      const result = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });

      expect(result.kind).toBe("ready");
      if (result.kind === "ready") {
        // br-audio-007: reader payload must NOT carry tts_provider/tts_model.
        expect(result.audio).not.toHaveProperty("tts_provider");
        expect(result.audio).not.toHaveProperty("tts_model");
        expect(result.audio.voice).toBeDefined();
        expect(result.audio.url).toContain("explanation-audio/42");
      }
      expect(queue.addCalls.length).toBe(0);
      expect(storage.uploaded.length).toBe(1);
      expect(storage.uploaded[0].contentType).toBe("audio/mpeg");
      expect(repo.upsertCalls).toBe(1);
    });

    it("subsequent stub call returns the cached row without re-synthesizing", async () => {
      const service = makeService(new FakeStubProvider());
      await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });
      const second = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });

      expect(second.kind).toBe("ready");
      expect(storage.uploaded.length).toBe(1);
      expect(repo.upsertCalls).toBe(1);
    });
  });

  describe("guest-scope guard (br-audio-013)", () => {
    it("guest on Genesis 1 is allowed (stub returns ready)", async () => {
      const service = makeService(new FakeStubProvider(), [genesis1]);
      const result = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: null,
      });
      expect(result.kind).toBe("ready");
    });

    it("guest on Genesis 2 is rejected with GUEST_SCOPE_EXCEEDED", async () => {
      const exp2: ExplanationRow = { ...explanation, chapter_id: 2 };
      const service = makeService(new FakeStubProvider(), [genesis2], [exp2]);
      await expect(
        service.getOrQueueAudio({
          explanation_id: 42,
          currentUserId: null,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("error cases", () => {
    it("non-existent explanation throws NotFoundError", async () => {
      const service = makeService(new FakeStubProvider(), [genesis1], []);
      await expect(
        service.getOrQueueAudio({
          explanation_id: 999,
          currentUserId: "u-1",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("getJobStatus", () => {
    it("returns completed + audio when job finished", async () => {
      const service = makeService();
      const first = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });
      expect(first.kind).toBe("queued");
      if (first.kind !== "queued") return;

      const row = await repo.upsert({
        explanation_id: 42,
        voice: "alloy",
        language_code: "en",
        storage_key: "explanation-audio/42/alloy/en/hash.mp3",
        duration_seconds: 10,
        character_count: 50,
        content_hash: "hash",
        tts_provider: "openai",
        tts_model: "tts-1-hd",
        is_stale: false,
      });
      queue.jobs.get(first.job.job_id)?.complete(row.audio_id);

      const status = await service.getJobStatus(first.job.job_id);
      expect(status.status).toBe("completed");
      // Reader DTO doesn't expose audio_id — verify via URL + duration.
      expect(status.audio?.url).toContain("explanation-audio/42/alloy/en");
      expect(status.audio?.duration_seconds).toBe(10);
    });

    it("returns failed + error_code when job failed", async () => {
      const service = makeService();
      const first = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });
      if (first.kind !== "queued") throw new Error("expected queued");
      queue.jobs.get(first.job.job_id)?.fail("synth died");

      const status = await service.getJobStatus(first.job.job_id);
      expect(status.status).toBe("failed");
      expect(status.error_code).toBe("GENERATION_FAILED");
    });

    it("throws NotFoundError for unknown job id", async () => {
      const service = makeService();
      await expect(
        service.getJobStatus("audio-gen:999:alloy:en"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("storageKeyFor / contentHashOf helpers", () => {
    it("produces the spec-defined storage key format", () => {
      const key = storageKeyFor(
        { explanation_id: 42, voice: "alloy", language_code: "en" },
        "abc",
      );
      expect(key).toBe("explanation-audio/42/alloy/en/abc.mp3");
    });

    it("content hash is stable and deterministic", () => {
      const a = contentHashOf("hello world");
      const b = contentHashOf("hello world");
      const c = contentHashOf("hello world!");
      expect(a).toBe(b);
      expect(a).not.toBe(c);
      expect(a).toHaveLength(64);
    });
  });
});
