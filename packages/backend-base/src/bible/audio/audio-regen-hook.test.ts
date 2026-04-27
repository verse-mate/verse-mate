/**
 * TASK-003 unit tests for AudioService's regen hook methods.
 *
 * Integration with a real DB + queue lives in audio-regen-hook.integration.test.ts.
 * This file drives the two new AudioService methods with fakes so the pure
 * logic (stale-mark + variant dedup + deterministic job id reuse) is covered
 * without infrastructure.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import type { Queue } from "bullmq";
import type { ExplanationAudios } from "database/src/models/public/ExplanationAudios";
import type { ObjectStorageService } from "../../shared/storage/storage.service";
import type {
  SynthesizeInput,
  SynthesizeOutput,
  TtsProvider,
  Voice,
} from "../../shared/tts/tts-provider.interface";
import type { AudioGenerationJobData } from "./audio-generation.queue";
import { audioGenerationJobId } from "./audio-generation.queue";
import { AudioRepository } from "./audio.repository";
import { AudioService, type KyselyTransaction } from "./audio.service";

// --- Minimal Kysely-transaction fake specialized for the two queries the
// hook runs: select voice+language_code, then update is_stale. -----------

function makeFakeTrx(initial: ExplanationAudios[]) {
  const rows = [...initial];
  const selectStaleUpdates: number[] = [];

  function selectFrom(_table: "explanation_audios") {
    let filtered = rows;
    const api: any = {
      select: () => api,
      where: (col: string, _op: string, val: unknown) => {
        filtered = filtered.filter((r: any) => r[col] === val);
        return api;
      },
      execute: async () =>
        filtered.map((r) => ({
          voice: r.voice,
          language_code: r.language_code,
        })),
    };
    return api;
  }

  function updateTable(_table: "explanation_audios") {
    let filtered = rows;
    let patch: Partial<ExplanationAudios> = {};
    const api: any = {
      set: (p: Partial<ExplanationAudios>) => {
        patch = p;
        return api;
      },
      where: (col: string, _op: string, val: unknown) => {
        filtered = filtered.filter((r: any) => r[col] === val);
        return api;
      },
      execute: async () => {
        for (const r of filtered) {
          Object.assign(r, patch);
          if (r.is_stale === true) selectStaleUpdates.push(r.explanation_id);
        }
        return { numUpdatedRows: BigInt(filtered.length) };
      },
    };
    return api;
  }

  return {
    trx: { selectFrom, updateTable } as unknown as KyselyTransaction,
    rows,
    selectStaleUpdates,
  };
}

class FakeQueue {
  public addCalls: {
    name: string;
    data: AudioGenerationJobData;
    jobId: string;
  }[] = [];
  public inFlight = new Set<string>();

  async getJob(jobId: string) {
    if (!this.inFlight.has(jobId)) return undefined;
    return {
      id: jobId,
      async isCompleted() {
        return false;
      },
      async isFailed() {
        return false;
      },
    } as never;
  }

  async add(
    name: string,
    data: AudioGenerationJobData,
    opts: { jobId: string },
  ) {
    this.addCalls.push({ name, data, jobId: opts.jobId });
    this.inFlight.add(opts.jobId);
    return { id: opts.jobId } as never;
  }
}

class FakeProvider implements TtsProvider {
  constructor(public readonly name: string) {}
  async synthesize(_input: SynthesizeInput): Promise<SynthesizeOutput> {
    return {
      audio: Buffer.from(""),
      duration_seconds: 0,
      character_count: 0,
      model_version: "tts-1-hd",
    };
  }
  async listVoices(language: string): Promise<Voice[]> {
    return [{ id: "alloy", language, label: "Alloy" }];
  }
}

function sampleRow(overrides: Partial<ExplanationAudios>): ExplanationAudios {
  return {
    audio_id: "a1",
    explanation_id: 100,
    voice: "alloy",
    language_code: "en",
    storage_key: "k",
    duration_seconds: 5,
    character_count: 50,
    content_hash: "h",
    tts_provider: "openai",
    tts_model: "tts-1-hd",
    is_stale: false,
    generated_at: new Date(),
    ...overrides,
  };
}

// Repository stub that isn't exercised directly but is required by the
// AudioService constructor.
class NoopRepository extends AudioRepository {
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  constructor() {
    super({} as any);
  }
}

describe("AudioService — regen hook (TASK-003)", () => {
  let queue: FakeQueue;

  beforeEach(() => {
    queue = new FakeQueue();
  });

  function makeService(provider: TtsProvider = new FakeProvider("openai")) {
    return new AudioService(
      {} as never,
      {} as unknown as ObjectStorageService,
      provider,
      queue as unknown as Queue<AudioGenerationJobData>,
      new NoopRepository(),
    );
  }

  describe("markStaleAndCollectVariants", () => {
    it("returns empty + no update when the old explanation has no audio", async () => {
      const { trx, rows } = makeFakeTrx([]);
      const service = makeService();

      const variants = await service.markStaleAndCollectVariants(999, trx);

      expect(variants).toEqual([]);
      expect(rows.length).toBe(0);
    });

    it("marks every matching row stale and returns their variants", async () => {
      const initial = [
        sampleRow({
          audio_id: "a1",
          explanation_id: 100,
          voice: "alloy",
          language_code: "en",
        }),
        sampleRow({
          audio_id: "a2",
          explanation_id: 100,
          voice: "nova",
          language_code: "en",
        }),
        sampleRow({
          audio_id: "a3",
          explanation_id: 101,
          voice: "alloy",
          language_code: "en",
        }),
      ];
      const { trx, rows } = makeFakeTrx(initial);
      const service = makeService();

      const variants = await service.markStaleAndCollectVariants(100, trx);

      expect(variants).toHaveLength(2);
      expect(variants).toContainEqual({ voice: "alloy", language_code: "en" });
      expect(variants).toContainEqual({ voice: "nova", language_code: "en" });

      // Only explanation 100's rows flipped.
      expect(rows.find((r) => r.audio_id === "a1")?.is_stale).toBe(true);
      expect(rows.find((r) => r.audio_id === "a2")?.is_stale).toBe(true);
      expect(rows.find((r) => r.audio_id === "a3")?.is_stale).toBe(false);
    });
  });

  describe("enqueueRegenForVariants", () => {
    it("enqueues one job per variant with deterministic ids", async () => {
      const service = makeService();
      const variants = [
        { voice: "alloy", language_code: "en" },
        { voice: "nova", language_code: "en" },
      ];

      const ids = await service.enqueueRegenForVariants(500, variants);

      expect(ids).toHaveLength(2);
      expect(ids[0]).toBe(
        audioGenerationJobId({
          explanation_id: 500,
          voice: "alloy",
          language_code: "en",
        }),
      );
      expect(ids[1]).toBe(
        audioGenerationJobId({
          explanation_id: 500,
          voice: "nova",
          language_code: "en",
        }),
      );
      expect(queue.addCalls).toHaveLength(2);
      expect(queue.addCalls[0].data).toEqual({
        explanation_id: 500,
        voice: "alloy",
        language_code: "en",
      });
    });

    it("reuses the in-flight job id instead of re-adding (br-audio-006)", async () => {
      const service = makeService();
      const existingJobId = audioGenerationJobId({
        explanation_id: 500,
        voice: "alloy",
        language_code: "en",
      });
      queue.inFlight.add(existingJobId);

      const ids = await service.enqueueRegenForVariants(500, [
        { voice: "alloy", language_code: "en" },
      ]);

      expect(ids).toEqual([existingJobId]);
      expect(queue.addCalls).toHaveLength(0);
    });

    it("stub provider is a no-op (no queue, no jobs)", async () => {
      const service = makeService(new FakeProvider("stub"));

      const ids = await service.enqueueRegenForVariants(500, [
        { voice: "stub", language_code: "en" },
      ]);

      expect(ids).toEqual([]);
      expect(queue.addCalls).toHaveLength(0);
    });

    it("empty variants array is a no-op", async () => {
      const service = makeService();
      const ids = await service.enqueueRegenForVariants(500, []);
      expect(ids).toEqual([]);
      expect(queue.addCalls).toHaveLength(0);
    });
  });
});
