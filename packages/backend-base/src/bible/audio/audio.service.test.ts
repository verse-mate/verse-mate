import { beforeEach, describe, expect, it } from "bun:test";
import type { Queue } from "bullmq";
import type { ExplanationAudios } from "database/src/models/public/ExplanationAudios";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../common/errors";
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
import { AudioService, isProductVariant } from "./audio.service";

const DEFAULT_VOICE = process.env.TTS_VOICE_EN ?? "alloy";

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

  async markStale(explanationId: number): Promise<void> {
    this.rows = this.rows.map((r) =>
      r.explanation_id === explanationId ? { ...r, is_stale: true } : r,
    );
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

  // Mirror BullMQ's Job.remove(): drops the entry from the queue so a
  // future `queue.add` with the same jobId is allowed to insert a
  // brand-new job. The owning FakeQueue calls back via `_remove`.
  remove?: () => Promise<void>;
}

class FakeQueue {
  public jobs = new Map<string, FakeJob>();
  public addCalls: {
    name: string;
    data: AudioGenerationJobData;
    jobId: string;
  }[] = [];

  async getJob(jobId: string): Promise<FakeJob | undefined> {
    const job = this.jobs.get(jobId);
    if (job) {
      // Wire `remove()` lazily so each returned job knows how to drop
      // itself from this queue's map — matching BullMQ's Job.remove().
      job.remove = async () => {
        this.jobs.delete(jobId);
      };
    }
    return job;
  }

  async add(
    name: string,
    data: AudioGenerationJobData,
    opts: { jobId: string },
  ): Promise<FakeJob> {
    // Critical: BullMQ's `Queue.add({ jobId })` is a no-op when a job
    // with that id already exists in the queue, regardless of state.
    // The earlier FakeQueue silently overwrote, hiding the prod bug
    // where a failed deterministic-id job permanently blocks retries.
    const prior = this.jobs.get(opts.jobId);
    if (prior) {
      return prior;
    }
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
  is_active: boolean;
};
type ChapterRow = {
  chapter_id: number;
  book_id: number;
  chapter_number: number;
};
type LanguageRow = {
  language_code: string;
  is_enabled: boolean;
  explanation_count: number;
};

function makeFakeDb(params: {
  explanations: ExplanationRow[];
  chapters: ChapterRow[];
  languages?: LanguageRow[];
}) {
  function selectFrom(
    table: "explanations" | "chapters" | "explanation_languages",
  ) {
    const tables = {
      explanations: params.explanations,
      chapters: params.chapters,
      explanation_languages: params.languages ?? [],
    };
    let filtered: unknown[] = [...tables[table]];
    const api: any = {
      select: () => api,
      selectAll: () => api,
      where: (col: string, op: string, val: unknown) => {
        filtered = filtered.filter((r: any) => {
          if (op === "in") return (val as unknown[]).includes(r[col]);
          if (op === ">") return r[col] > (val as number);
          return r[col] === val;
        });
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
    is_active: true,
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
    languages: LanguageRow[] = [],
  ) {
    const db = makeFakeDb({ explanations, chapters, languages });
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
        voice: DEFAULT_VOICE,
        language_code: "en",
        storage_key: `explanation-audio/42/${DEFAULT_VOICE}/en/hash.mp3`,
        duration_seconds: 10,
        character_count: 50,
        content_hash: "hash",
        tts_provider: "openai",
        tts_model: "tts-1-hd",
        is_stale: false,
      });

      const result = await service.getOrQueueAudio({
        explanation_id: 42,
        voice: DEFAULT_VOICE,
        currentUserId: "u-1",
      });

      expect(result.kind).toBe("ready");
      if (result.kind === "ready") {
        expect(result.audio.url).toContain(
          `explanation-audio/42/${DEFAULT_VOICE}/en/hash.mp3`,
        );
        expect(result.audio.voice).toBe(DEFAULT_VOICE);
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

      const status = await service.getJobStatus(first.job.job_id, "u-1");
      expect(status.status).toBe("completed");
      // Reader DTO doesn't expose audio_id — verify via URL + duration.
      expect(status.audio?.url).toContain("explanation-audio/42/alloy/en");
      expect(status.audio?.duration_seconds).toBe(10);
    });

    it("replaces a completed job when its audio has since gone stale", async () => {
      const service = makeService();
      const first = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });
      if (first.kind !== "queued") throw new Error("expected queued");
      queue.jobs.get(first.job.job_id)?.complete("old-audio");
      await repo.upsert({
        explanation_id: 42,
        voice: DEFAULT_VOICE,
        language_code: "en",
        storage_key: `explanation-audio/42/${DEFAULT_VOICE}/en/hash.mp3`,
        duration_seconds: 10,
        character_count: 50,
        content_hash: "hash",
        tts_provider: "openai",
        tts_model: "tts-1-hd",
        is_stale: true,
      });

      const again = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });
      expect(again.kind).toBe("queued");
      expect(queue.addCalls.length).toBe(2);
      expect(await queue.jobs.get(first.job.job_id)?.isCompleted()).toBe(false);
    });

    it("returns failed + error_code when job failed", async () => {
      const service = makeService();
      const first = await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });
      if (first.kind !== "queued") throw new Error("expected queued");
      queue.jobs.get(first.job.job_id)?.fail("synth died");

      const status = await service.getJobStatus(first.job.job_id, "u-1");
      expect(status.status).toBe("failed");
      expect(status.error_code).toBe("GENERATION_FAILED");
    });

    it("throws NotFoundError for unknown job id", async () => {
      const service = makeService();
      await expect(
        service.getJobStatus(`audio-gen:999:${DEFAULT_VOICE}:en`, "u-1"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("offered variants", () => {
    const languages: LanguageRow[] = [
      { language_code: "pt", is_enabled: true, explanation_count: 10 },
      { language_code: "fr", is_enabled: false, explanation_count: 10 },
      { language_code: "de", is_enabled: true, explanation_count: 0 },
      { language_code: "../x", is_enabled: true, explanation_count: 10 },
    ];

    function service() {
      return makeService(
        new FakeOpenAiProvider(),
        [genesis1],
        [explanation],
        languages,
      );
    }

    async function expectRejected(params: {
      voice?: string;
      language?: string;
    }) {
      await expect(
        service().getOrQueueAudio({
          explanation_id: 42,
          currentUserId: "u-1",
          ...params,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(queue.addCalls.length).toBe(0);
      expect(storage.uploaded.length).toBe(0);
    }

    async function queuedLanguage(language: string) {
      const result = await service().getOrQueueAudio({
        explanation_id: 42,
        language,
        currentUserId: "u-1",
      });
      expect(result.kind).toBe("queued");
      return queue.addCalls[0].data.language_code;
    }

    it("rejects a language nobody offers", async () => {
      await expectRejected({ language: "es" });
    });

    it("rejects a disabled language", async () => {
      await expectRejected({ language: "fr" });
    });

    it("serves the explanation's language for an enabled language with no explanations", async () => {
      expect(await queuedLanguage("de")).toBe("en");
    });

    it("rejects a regional form of the explanation's language nobody offers", async () => {
      await expectRejected({ language: "en-GB" });
    });

    it("rejects a language carrying path segments, even one stored as enabled", async () => {
      await expectRejected({ language: "en/../../x" });
      await expectRejected({ language: "../x" });
    });

    it.each(["EN", "en-us", ""])(
      "rejects the malformed language %p",
      async (language) => {
        await expectRejected({ language });
      },
    );

    it("rejects any voice other than the product's voice", async () => {
      await expectRejected({
        voice: "alloy" === DEFAULT_VOICE ? "nova" : "alloy",
      });
      await expectRejected({ voice: "nobody" });
      await expectRejected({ voice: `${DEFAULT_VOICE}/../x` });
    });

    it("accepts the product's voice when sent explicitly", async () => {
      const result = await service().getOrQueueAudio({
        explanation_id: 42,
        voice: DEFAULT_VOICE,
        currentUserId: "u-1",
      });
      expect(result.kind).toBe("queued");
      expect(queue.addCalls[0].data.voice).toBe(DEFAULT_VOICE);
    });

    it.each(["en", "en-US"])(
      "keeps the explanation's own form %s",
      async (language) => {
        expect(await queuedLanguage(language)).toBe(language);
      },
    );

    it.each(["pt", "pt-BR"])(
      "serves the explanation's language for the offered language %s",
      async (language) => {
        expect(await queuedLanguage(language)).toBe("en");
      },
    );

    it("does not create a new variant for another offered language", async () => {
      await service().getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
      });
      await service().getOrQueueAudio({
        explanation_id: 42,
        language: "pt-BR",
        currentUserId: "u-1",
      });
      expect(queue.addCalls.length).toBe(1);
    });
  });

  describe("job status guest scope", () => {
    async function queuedJob(chapters: ChapterRow[], exp: ExplanationRow) {
      const service = makeService(new FakeOpenAiProvider(), chapters, [exp]);
      const result = await service.getOrQueueAudio({
        explanation_id: exp.explanation_id,
        currentUserId: "u-1",
      });
      if (result.kind !== "queued") throw new Error("expected queued");
      return { service, jobId: result.job.job_id };
    }

    it("refuses a guest the job of a chapter outside the guest scope", async () => {
      const exp2: ExplanationRow = { ...explanation, chapter_id: 2 };
      const { service, jobId } = await queuedJob([genesis2], exp2);
      await expect(service.getJobStatus(jobId, null)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it("answers a signed-in reader for any chapter", async () => {
      const exp2: ExplanationRow = { ...explanation, chapter_id: 2 };
      const { service, jobId } = await queuedJob([genesis2], exp2);
      expect((await service.getJobStatus(jobId, "u-1")).status).toBe("queued");
    });

    it("answers a guest inside the guest scope", async () => {
      const { service, jobId } = await queuedJob([genesis1], explanation);
      expect((await service.getJobStatus(jobId, null)).status).toBe("queued");
    });

    it.each(["not-a-job", "audio-gen:abc:x:en", "bull:audio-generation:1"])(
      "answers 404 for the malformed job id %p",
      async (jobId) => {
        const service = makeService();
        await expect(service.getJobStatus(jobId, "u-1")).rejects.toBeInstanceOf(
          NotFoundError,
        );
      },
    );

    it.each([
      `audio-gen:99999999999:${DEFAULT_VOICE}:en`,
      `audio-gen:2147483648:${DEFAULT_VOICE}:en`,
      `audio-gen:00000000042:${DEFAULT_VOICE}:en`,
    ])(
      "answers 404 for the out-of-range job id %p without a lookup",
      async (jobId) => {
        let lookups = 0;
        const service = new AudioService(
          {
            getOrCreateConnection: () => {
              lookups += 1;
              throw new Error("integer out of range");
            },
          } as never,
          storage as unknown as ObjectStorageService,
          new FakeOpenAiProvider(),
          queue as unknown as Queue<AudioGenerationJobData>,
          repo,
        );
        for (const user of [null, "u-1"]) {
          await expect(
            service.getJobStatus(jobId, user),
          ).rejects.toBeInstanceOf(NotFoundError);
        }
        expect(lookups).toBe(0);
      },
    );
  });

  describe("synthesis limit hook", () => {
    it("runs before a new job is queued", async () => {
      const service = makeService();
      let calls = 0;
      await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
        beforeSynthesis: async () => {
          calls += 1;
        },
      });
      expect(calls).toBe(1);
      expect(queue.addCalls.length).toBe(1);
    });

    it("runs before inline stub synthesis", async () => {
      const service = makeService(new FakeStubProvider());
      let calls = 0;
      await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
        beforeSynthesis: async () => {
          calls += 1;
        },
      });
      expect(calls).toBe(1);
      expect(storage.uploaded.length).toBe(1);
    });

    it("stops the miss when it throws", async () => {
      const service = makeService();
      await expect(
        service.getOrQueueAudio({
          explanation_id: 42,
          currentUserId: "u-1",
          beforeSynthesis: async () => {
            throw new Error("limited");
          },
        }),
      ).rejects.toThrow("limited");
      expect(queue.addCalls.length).toBe(0);
    });

    it("does not run for cached audio or a job already in flight", async () => {
      const service = makeService();
      let calls = 0;
      const beforeSynthesis = async () => {
        calls += 1;
      };
      await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
        beforeSynthesis,
      });
      await service.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
        beforeSynthesis,
      });
      expect(calls).toBe(1);

      const stub = makeService(new FakeStubProvider());
      await stub.getOrQueueAudio({ explanation_id: 42, currentUserId: "u-1" });
      calls = 0;
      await stub.getOrQueueAudio({
        explanation_id: 42,
        currentUserId: "u-1",
        beforeSynthesis,
      });
      expect(calls).toBe(0);
    });
  });

  describe("queued job synthesis", () => {
    function jobService(exp: ExplanationRow = explanation) {
      return makeService(new FakeOpenAiProvider(), [genesis1], [exp]);
    }

    it.each([
      {
        voice: DEFAULT_VOICE === "nova" ? "alloy" : "nova",
        language_code: "en",
      },
      { voice: DEFAULT_VOICE, language_code: "pt-BR" },
      { voice: DEFAULT_VOICE, language_code: "en/../x" },
    ])("refuses the variant %p the product does not offer", async (variant) => {
      await expect(
        jobService().synthesizeQueuedJob({ explanation_id: 42, ...variant }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(storage.uploaded.length).toBe(0);
      expect(repo.upsertCalls).toBe(0);
    });

    it.each(["en", "en-US"])(
      "synthesizes the product voice in the explanation's form %s",
      async (language_code) => {
        const row = await jobService().synthesizeQueuedJob({
          explanation_id: 42,
          voice: DEFAULT_VOICE,
          language_code,
        });
        expect(row.language_code).toBe(language_code);
        expect(row.character_count).toBe(explanation.explanation.length);
        expect(storage.uploaded.length).toBe(1);
      },
    );

    it("fails for an explanation that no longer exists", async () => {
      await expect(
        jobService().synthesizeQueuedJob({
          explanation_id: 7,
          voice: DEFAULT_VOICE,
          language_code: "en",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
    it("marks its audio stale when the version is replaced during synthesis", async () => {
      const racing: ExplanationRow = { ...explanation };
      const provider = new FakeOpenAiProvider();
      const synthesize = provider.synthesize.bind(provider);
      provider.synthesize = async (input) => {
        racing.is_active = false;
        return synthesize(input);
      };
      const row = await makeService(
        provider,
        [genesis1],
        [racing],
      ).synthesizeQueuedJob({
        explanation_id: 42,
        voice: DEFAULT_VOICE,
        language_code: "en",
      });
      expect(row.is_stale).toBe(true);
    });

    it("refuses an explanation version that was replaced", async () => {
      await expect(
        jobService({ ...explanation, is_active: false }).synthesizeQueuedJob({
          explanation_id: 42,
          voice: DEFAULT_VOICE,
          language_code: "en",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.uploaded.length).toBe(0);
      expect(repo.upsertCalls).toBe(0);
    });
  });

  describe("replaced explanation versions", () => {
    const replaced: ExplanationRow = { ...explanation, is_active: false };

    function storedRow(is_stale: boolean) {
      return repo.upsert({
        explanation_id: 42,
        voice: DEFAULT_VOICE,
        language_code: "en",
        storage_key: `explanation-audio/42/${DEFAULT_VOICE}/en/hash.mp3`,
        duration_seconds: 10,
        character_count: 50,
        content_hash: "hash",
        tts_provider: "openai",
        tts_model: "tts-1-hd",
        is_stale,
      });
    }

    it.each([true, false])(
      "serves the audio already made for it (stale: %p)",
      async (is_stale) => {
        await storedRow(is_stale);
        let calls = 0;
        const result = await makeService(
          new FakeOpenAiProvider(),
          [genesis1],
          [replaced],
        ).getOrQueueAudio({
          explanation_id: 42,
          currentUserId: null,
          beforeSynthesis: async () => {
            calls += 1;
          },
        });
        expect(result.kind).toBe("ready");
        expect(calls).toBe(0);
        expect(queue.addCalls.length).toBe(0);
      },
    );

    it.each([
      ["queue", new FakeOpenAiProvider()],
      ["stub", new FakeStubProvider()],
    ] as const)(
      "answers not found and synthesizes nothing when it has no audio (%s provider)",
      async (_name, provider) => {
        let calls = 0;
        await expect(
          makeService(provider, [genesis1], [replaced]).getOrQueueAudio({
            explanation_id: 42,
            currentUserId: "u-1",
            beforeSynthesis: async () => {
              calls += 1;
            },
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(calls).toBe(0);
        expect(queue.addCalls.length).toBe(0);
        expect(storage.uploaded.length).toBe(0);
      },
    );
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

describe("isProductVariant", () => {
  it.each([
    ["en", DEFAULT_VOICE, "en", true],
    ["en", DEFAULT_VOICE, "en-US", true],
    ["en-US", DEFAULT_VOICE, "en", true],
    ["pt", DEFAULT_VOICE, "pt-BR", true],
    ["en", DEFAULT_VOICE, "en-GB", false],
    ["en", DEFAULT_VOICE, "pt-BR", false],
    ["en", `${DEFAULT_VOICE}-x`, "en", false],
  ] as const)(
    "explanation in %p, variant %p/%p offered: %p",
    (explanationLanguage, voice, language_code, expected) => {
      expect(
        isProductVariant(explanationLanguage, { voice, language_code }),
      ).toBe(expected);
    },
  );
});
