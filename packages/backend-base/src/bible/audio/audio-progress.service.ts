import type { ExplanationAudioProgress } from "database/src/models/public/ExplanationAudioProgress";
import type { db } from "../../shared/shared.plugin";
import { AudioProgressRepository } from "./audio-progress.repository";

/**
 * TASK-005 / br-audio-004 — resume-progress lifecycle rules.
 *
 * Three operations, one rule each:
 *
 *   Save        — require position >= MIN_SAVE_SECONDS and < COMPLETE_THRESHOLD
 *                  of duration. Otherwise the save is a silent no-op.
 *   Clear       — explicit `reason: "complete"` OR an implicit save at/above
 *                  the completion threshold. Either way, delete the row.
 *   Read        — if the stored position is at/above 95% of the CURRENT
 *                  audio duration (which may be shorter than when the
 *                  position was saved — admin regen can shrink durations),
 *                  treat it as complete and return nothing (404 at the
 *                  HTTP layer).
 *
 * Guest (userId === null) is a silent no-op on writes and 404 on reads.
 */
export const MIN_SAVE_SECONDS = 30;
export const COMPLETE_THRESHOLD = 0.95;

export type SaveReason = "pause" | "complete" | "background" | "navigation";

export interface SavePositionInput {
  userId: string | null;
  explanationId: number;
  positionSeconds: number;
  durationSeconds: number;
  reason: SaveReason;
}

export type SavePositionResult =
  | { kind: "saved"; progress: ExplanationAudioProgress }
  | { kind: "cleared" }
  | { kind: "skipped"; reason: "guest" | "below_minimum" };

export interface ProgressDto {
  position_seconds: number;
  duration_seconds: number;
  updated_at: string;
}

export class AudioProgressService {
  private readonly repository: AudioProgressRepository;

  constructor(
    private readonly db: db,
    repository?: AudioProgressRepository,
  ) {
    this.repository = repository ?? new AudioProgressRepository(db);
  }

  async savePosition(input: SavePositionInput): Promise<SavePositionResult> {
    if (input.userId === null) {
      return { kind: "skipped", reason: "guest" };
    }

    // Explicit completion always clears, regardless of position.
    if (input.reason === "complete") {
      await this.repository.deleteByUserAndExplanation(
        input.userId,
        input.explanationId,
      );
      return { kind: "cleared" };
    }

    // Implicit completion: position is already at/above the threshold.
    if (
      input.durationSeconds > 0 &&
      input.positionSeconds >= COMPLETE_THRESHOLD * input.durationSeconds
    ) {
      await this.repository.deleteByUserAndExplanation(
        input.userId,
        input.explanationId,
      );
      return { kind: "cleared" };
    }

    // Below the save floor — don't record tiny sessions (br-audio-004).
    if (input.positionSeconds < MIN_SAVE_SECONDS) {
      return { kind: "skipped", reason: "below_minimum" };
    }

    const progress = await this.repository.upsert({
      user_id: input.userId,
      explanation_id: input.explanationId,
      position_seconds: input.positionSeconds,
      duration_seconds: input.durationSeconds,
      updated_at: new Date(),
    });

    return { kind: "saved", progress };
  }

  async getPosition(
    userId: string | null,
    explanationId: number,
  ): Promise<ProgressDto | undefined> {
    if (userId === null) return undefined;

    const row = await this.repository.getByUserAndExplanation(
      userId,
      explanationId,
    );
    if (!row) return undefined;

    // Validate-on-read: compare the stored position against the CURRENT
    // audio's duration (the audio the user would resume into), not the
    // duration stored on the progress row — that value is frozen at save
    // time and may be stale after an admin regen.
    const currentDuration =
      await this.repository.getCurrentAudioDuration(explanationId);
    if (
      currentDuration !== undefined &&
      currentDuration > 0 &&
      Number(row.position_seconds) >= COMPLETE_THRESHOLD * currentDuration
    ) {
      return undefined;
    }

    return {
      position_seconds: Number(row.position_seconds),
      duration_seconds: Number(row.duration_seconds),
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : new Date(row.updated_at).toISOString(),
    };
  }

  async clearPosition(
    userId: string | null,
    explanationId: number,
  ): Promise<void> {
    if (userId === null) return;
    await this.repository.deleteByUserAndExplanation(userId, explanationId);
  }
}
