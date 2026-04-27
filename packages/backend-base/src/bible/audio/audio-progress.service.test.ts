/**
 * TASK-005 unit tests — walks every branch of br-audio-004.
 *
 * Mapped 1-to-1 against the AC in tasks.md:
 *   AC-1: POST pos=20s, dur=200s → below floor, no save.
 *   AC-2: POST pos=100s, dur=200s (50%) → saved; read returns stored.
 *   AC-3: POST pos=195s, dur=200s (97.5%) → existing row deleted.
 *   AC-4: POST reason=complete regardless of position → deleted.
 *   AC-5: Read with stored pos=180, dur=200 but current audio duration=150 → 404.
 *   AC-6: Guest POST → 204, no writes.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import type { ExplanationAudioProgress } from "database/src/models/public/ExplanationAudioProgress";
import { AudioProgressRepository } from "./audio-progress.repository";
import { AudioProgressService } from "./audio-progress.service";

class FakeProgressRepo extends AudioProgressRepository {
  public rows = new Map<string, ExplanationAudioProgress>();
  public currentDuration = new Map<number, number>();
  public upsertCalls = 0;
  public deleteCalls: Array<{ user_id: string; explanation_id: number }> = [];

  // biome-ignore lint/suspicious/noExplicitAny: test stub
  constructor() {
    super({} as any);
  }

  private keyOf(userId: string, explanationId: number) {
    return `${userId}:${explanationId}`;
  }

  async getByUserAndExplanation(userId: string, explanationId: number) {
    return this.rows.get(this.keyOf(userId, explanationId));
  }

  async upsert(
    row: Parameters<AudioProgressRepository["upsert"]>[0],
  ): Promise<ExplanationAudioProgress> {
    this.upsertCalls += 1;
    const created: ExplanationAudioProgress = {
      progress_id: `p-${this.upsertCalls}`,
      user_id: row.user_id,
      explanation_id: row.explanation_id,
      position_seconds: row.position_seconds,
      duration_seconds: row.duration_seconds,
      updated_at: (row.updated_at as Date) ?? new Date(),
    };
    this.rows.set(this.keyOf(row.user_id, row.explanation_id), created);
    return created;
  }

  async deleteByUserAndExplanation(userId: string, explanationId: number) {
    this.deleteCalls.push({ user_id: userId, explanation_id: explanationId });
    this.rows.delete(this.keyOf(userId, explanationId));
  }

  async getCurrentAudioDuration(explanationId: number) {
    return this.currentDuration.get(explanationId);
  }
}

describe("AudioProgressService (br-audio-004)", () => {
  let repo: FakeProgressRepo;
  let service: AudioProgressService;
  const USER = "11111111-1111-1111-1111-111111111111";
  const EXPLANATION = 42;

  beforeEach(() => {
    repo = new FakeProgressRepo();
    service = new AudioProgressService({} as never, repo);
  });

  describe("savePosition", () => {
    it("AC-1: below 30s floor → skipped, no write", async () => {
      const result = await service.savePosition({
        userId: USER,
        explanationId: EXPLANATION,
        positionSeconds: 20,
        durationSeconds: 200,
        reason: "pause",
      });
      expect(result.kind).toBe("skipped");
      expect(repo.upsertCalls).toBe(0);
      expect(repo.deleteCalls).toHaveLength(0);
    });

    it("AC-2: 50% (100s of 200s) → saved", async () => {
      const result = await service.savePosition({
        userId: USER,
        explanationId: EXPLANATION,
        positionSeconds: 100,
        durationSeconds: 200,
        reason: "pause",
      });
      expect(result.kind).toBe("saved");
      if (result.kind === "saved") {
        expect(Number(result.progress.position_seconds)).toBe(100);
        expect(Number(result.progress.duration_seconds)).toBe(200);
      }
    });

    it("AC-3: 97.5% (>= 95% threshold) → cleared", async () => {
      // Seed an existing row so we can observe the delete.
      await repo.upsert({
        user_id: USER,
        explanation_id: EXPLANATION,
        position_seconds: 60,
        duration_seconds: 200,
        updated_at: new Date(),
      });

      const result = await service.savePosition({
        userId: USER,
        explanationId: EXPLANATION,
        positionSeconds: 195,
        durationSeconds: 200,
        reason: "pause",
      });
      expect(result.kind).toBe("cleared");
      expect(repo.deleteCalls).toHaveLength(1);
      expect(
        await repo.getByUserAndExplanation(USER, EXPLANATION),
      ).toBeUndefined();
    });

    it("AC-3 boundary: exactly 95% → cleared", async () => {
      const result = await service.savePosition({
        userId: USER,
        explanationId: EXPLANATION,
        positionSeconds: 190, // 0.95 × 200
        durationSeconds: 200,
        reason: "pause",
      });
      expect(result.kind).toBe("cleared");
    });

    it("AC-3 boundary: 94.99% → saved (not cleared)", async () => {
      const result = await service.savePosition({
        userId: USER,
        explanationId: EXPLANATION,
        positionSeconds: 189.98,
        durationSeconds: 200,
        reason: "pause",
      });
      expect(result.kind).toBe("saved");
    });

    it("AC-4: reason='complete' at any position → cleared", async () => {
      await repo.upsert({
        user_id: USER,
        explanation_id: EXPLANATION,
        position_seconds: 60,
        duration_seconds: 200,
        updated_at: new Date(),
      });

      const result = await service.savePosition({
        userId: USER,
        explanationId: EXPLANATION,
        positionSeconds: 5, // irrelevant — reason 'complete' wins
        durationSeconds: 200,
        reason: "complete",
      });
      expect(result.kind).toBe("cleared");
      expect(
        await repo.getByUserAndExplanation(USER, EXPLANATION),
      ).toBeUndefined();
    });

    it("AC-6: guest POST → skipped (kind='skipped', reason='guest'), no writes", async () => {
      const result = await service.savePosition({
        userId: null,
        explanationId: EXPLANATION,
        positionSeconds: 100,
        durationSeconds: 200,
        reason: "pause",
      });
      expect(result.kind).toBe("skipped");
      if (result.kind === "skipped") expect(result.reason).toBe("guest");
      expect(repo.upsertCalls).toBe(0);
      expect(repo.deleteCalls).toHaveLength(0);
    });
  });

  describe("getPosition", () => {
    it("AC-2 (read half): returns stored values", async () => {
      await repo.upsert({
        user_id: USER,
        explanation_id: EXPLANATION,
        position_seconds: 100,
        duration_seconds: 200,
        updated_at: new Date("2026-04-21T12:00:00Z"),
      });

      const dto = await service.getPosition(USER, EXPLANATION);
      expect(dto).toBeDefined();
      expect(dto?.position_seconds).toBe(100);
      expect(dto?.duration_seconds).toBe(200);
      expect(dto?.updated_at).toBe("2026-04-21T12:00:00.000Z");
    });

    it("AC-5: stored pos=180 / dur=200 but current audio is 150s → 404 (validate-on-read)", async () => {
      await repo.upsert({
        user_id: USER,
        explanation_id: EXPLANATION,
        position_seconds: 180,
        duration_seconds: 200,
        updated_at: new Date(),
      });
      repo.currentDuration.set(EXPLANATION, 150);

      const dto = await service.getPosition(USER, EXPLANATION);
      expect(dto).toBeUndefined();
    });

    it("current audio duration unavailable → use stored values (permissive)", async () => {
      await repo.upsert({
        user_id: USER,
        explanation_id: EXPLANATION,
        position_seconds: 100,
        duration_seconds: 200,
        updated_at: new Date(),
      });
      // No entry in currentDuration — repo.getCurrentAudioDuration returns undefined.

      const dto = await service.getPosition(USER, EXPLANATION);
      expect(dto).toBeDefined();
      expect(dto?.position_seconds).toBe(100);
    });

    it("guest → 404 (undefined)", async () => {
      const dto = await service.getPosition(null, EXPLANATION);
      expect(dto).toBeUndefined();
    });

    it("no row → undefined", async () => {
      const dto = await service.getPosition(USER, 999);
      expect(dto).toBeUndefined();
    });
  });

  describe("clearPosition", () => {
    it("deletes when the user is authenticated", async () => {
      await repo.upsert({
        user_id: USER,
        explanation_id: EXPLANATION,
        position_seconds: 100,
        duration_seconds: 200,
        updated_at: new Date(),
      });

      await service.clearPosition(USER, EXPLANATION);

      expect(repo.deleteCalls).toHaveLength(1);
      expect(
        await repo.getByUserAndExplanation(USER, EXPLANATION),
      ).toBeUndefined();
    });

    it("guest → no-op", async () => {
      await service.clearPosition(null, EXPLANATION);
      expect(repo.deleteCalls).toHaveLength(0);
    });
  });
});
