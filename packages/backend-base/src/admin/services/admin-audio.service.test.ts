/**
 * TASK-006 admin-audio service — unit tests.
 *
 * Uses a db fake that supports the two shapes the service hits:
 *   - selectFrom("explanations").where(...).execute() — id resolution
 *   - selectFrom("explanations as e")...left join("a")... — list endpoint
 *
 * List-endpoint tests run against the integration test (real Postgres)
 * to avoid modeling Kysely's full join/selection machinery in fakes.
 * Unit tests here focus on bulk-regenerate id resolution and dedup.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import type { Queue } from "bullmq";
import {
  type AudioGenerationJobData,
  audioGenerationJobId,
} from "../../bible/audio/audio-generation.queue";
import { AdminAudioService } from "./admin-audio.service";

class FakeQueue {
  public addCalls: Array<{
    data: AudioGenerationJobData;
    jobId: string;
  }> = [];
  public inFlight = new Set<string>();

  async getJob(jobId: string) {
    if (!this.inFlight.has(jobId)) return undefined;
    return {
      async isCompleted() {
        return false;
      },
      async isFailed() {
        return false;
      },
    } as never;
  }

  async add(
    _name: string,
    data: AudioGenerationJobData,
    opts: { jobId: string },
  ) {
    this.addCalls.push({ data, jobId: opts.jobId });
    this.inFlight.add(opts.jobId);
    return { id: opts.jobId } as never;
  }
}

type Explanation = {
  explanation_id: number;
  language_code: string;
  type?: string;
  book_id?: number;
  chapter_number?: number;
  is_active?: boolean;
};

/**
 * Tiny Kysely-shape fake covering just the two code paths the service's
 * resolveExplanationIds + bulkRegenerate touch. List endpoint is covered
 * by the integration test.
 */
function makeFakeDb(explanations: Explanation[]) {
  function selectFrom(alias: "explanations" | "explanations as e") {
    const table = explanations;
    const api: any = {
      _whereClauses: [] as Array<(r: any) => boolean>,
      innerJoin: (_t: string, _a: string, _b: string) => api,
      select: (_cols: any) => api,
      where: (col: string, op: string, val: unknown) => {
        const field = col.replace(/^.*\./, "");
        if (op === "in") {
          const set = new Set(val as unknown[]);
          api._whereClauses.push((r: any) => set.has(r[field]));
        } else {
          api._whereClauses.push((r: any) => r[field] === val);
        }
        return api;
      },
      execute: async () =>
        table.filter((r) => api._whereClauses.every((f: any) => f(r))),
    };
    return api;
  }
  return { getOrCreateConnection: () => ({ selectFrom }) } as never;
}

describe("AdminAudioService.bulkRegenerate", () => {
  let queue: FakeQueue;

  beforeEach(() => {
    queue = new FakeQueue();
  });

  const explanations: Explanation[] = [
    {
      explanation_id: 1,
      language_code: "en",
      book_id: 40,
      chapter_number: 5,
      type: "summary",
      is_active: true,
    },
    {
      explanation_id: 2,
      language_code: "en",
      book_id: 40,
      chapter_number: 5,
      type: "byline",
      is_active: true,
    },
    {
      explanation_id: 3,
      language_code: "en",
      book_id: 40,
      chapter_number: 6,
      type: "byline",
      is_active: true,
    },
    {
      explanation_id: 4,
      language_code: "pt",
      book_id: 41,
      chapter_number: 1,
      type: "summary",
      is_active: true,
    },
  ];

  function makeService() {
    return new AdminAudioService(
      makeFakeDb(explanations),
      queue as unknown as Queue<AudioGenerationJobData>,
    );
  }

  it("with explicit explanationIds: queues one job per id with defaults", async () => {
    const result = await makeService().bulkRegenerate({
      explanationIds: [1, 2],
    });
    expect(result.job_count).toBe(2);
    expect(result.batch_id).toMatch(/^audio-regen-/);
    expect(queue.addCalls).toHaveLength(2);
    expect(queue.addCalls[0].data.explanation_id).toBe(1);
    expect(queue.addCalls[1].data.explanation_id).toBe(2);
  });

  it("with filters bookId=40 + type=byline: resolves to matching ids only", async () => {
    const result = await makeService().bulkRegenerate({
      filters: { bookId: 40, type: "byline" as any },
    });
    expect(result.job_count).toBe(2);
    expect(queue.addCalls.map((c) => c.data.explanation_id).sort()).toEqual([
      2, 3,
    ]);
  });

  it("explicit voice + language override per-explanation defaults", async () => {
    await makeService().bulkRegenerate({
      explanationIds: [1, 4],
      voice: "nova",
      language: "pt",
    });
    expect(queue.addCalls.every((c) => c.data.voice === "nova")).toBe(true);
    expect(queue.addCalls.every((c) => c.data.language_code === "pt")).toBe(
      true,
    );
  });

  it("already-in-flight job is not re-enqueued (br-audio-006 dedup)", async () => {
    const targetJobId = audioGenerationJobId({
      explanation_id: 1,
      voice: process.env.TTS_VOICE_EN ?? "alloy",
      language_code: "en",
    });
    queue.inFlight.add(targetJobId);

    const result = await makeService().bulkRegenerate({
      explanationIds: [1, 2],
    });

    expect(result.job_count).toBe(1); // only #2 queued
    expect(queue.addCalls).toHaveLength(1);
    expect(queue.addCalls[0].data.explanation_id).toBe(2);
  });

  it("empty filter result returns job_count=0 but still returns a batch_id", async () => {
    const result = await makeService().bulkRegenerate({
      filters: { bookId: 99 },
    });
    expect(result.job_count).toBe(0);
    expect(result.batch_id).toMatch(/^audio-regen-/);
    expect(queue.addCalls).toHaveLength(0);
  });

  it("explanationIds dedupes", async () => {
    const result = await makeService().bulkRegenerate({
      explanationIds: [1, 1, 2, 2],
    });
    expect(result.job_count).toBe(2);
  });
});
