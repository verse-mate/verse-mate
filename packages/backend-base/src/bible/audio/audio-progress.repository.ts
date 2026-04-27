import type {
  ExplanationAudioProgress,
  NewExplanationAudioProgress,
} from "database/src/models/public/ExplanationAudioProgress";
import type { db } from "../../shared/shared.plugin";

/**
 * Persistence for br-audio-004 (resume progress). One row per
 * (user_id, explanation_id) — unique index enforced by the migration.
 */
export class AudioProgressRepository {
  constructor(private readonly db: db) {}

  async getByUserAndExplanation(
    userId: string,
    explanationId: number,
  ): Promise<ExplanationAudioProgress | undefined> {
    return this.db
      .getOrCreateConnection()
      .selectFrom("explanation_audio_progress")
      .selectAll()
      .where("user_id", "=", userId)
      .where("explanation_id", "=", explanationId)
      .executeTakeFirst();
  }

  async upsert(
    row: NewExplanationAudioProgress,
  ): Promise<ExplanationAudioProgress> {
    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (tx) => {
        await tx
          .deleteFrom("explanation_audio_progress")
          .where("user_id", "=", row.user_id)
          .where("explanation_id", "=", row.explanation_id)
          .execute();
        return tx
          .insertInto("explanation_audio_progress")
          .values(row)
          .returningAll()
          .executeTakeFirstOrThrow();
      });
  }

  async deleteByUserAndExplanation(
    userId: string,
    explanationId: number,
  ): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .deleteFrom("explanation_audio_progress")
      .where("user_id", "=", userId)
      .where("explanation_id", "=", explanationId)
      .execute();
  }

  /**
   * Current audio duration for the validate-on-read check. Picks any
   * non-stale variant — progress is stored per (user, explanation),
   * not per (voice, language), so comparing against any current variant
   * is correct: durations for the same text in different voices are
   * similar enough for the 95% threshold.
   */
  async getCurrentAudioDuration(
    explanationId: number,
  ): Promise<number | undefined> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("explanation_audios")
      .select("duration_seconds")
      .where("explanation_id", "=", explanationId)
      .where("is_stale", "=", false)
      .orderBy("generated_at", "desc")
      .executeTakeFirst();
    return row ? Number(row.duration_seconds) : undefined;
  }
}
