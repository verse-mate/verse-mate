import { createHash } from "node:crypto";
import type {
  ExplanationAudios,
  NewExplanationAudios,
} from "database/src/models/public/ExplanationAudios";
import type { db } from "../../shared/shared.plugin";

export interface AudioVariantKey {
  explanation_id: number;
  voice: string;
  language_code: string;
}

export class AudioRepository {
  constructor(private readonly db: db) {}

  async findCurrent(
    key: AudioVariantKey,
  ): Promise<ExplanationAudios | undefined> {
    return this.db
      .getOrCreateConnection()
      .selectFrom("explanation_audios")
      .selectAll()
      .where("explanation_id", "=", key.explanation_id)
      .where("voice", "=", key.voice)
      .where("language_code", "=", key.language_code)
      .executeTakeFirst();
  }

  async findById(audioId: string): Promise<ExplanationAudios | undefined> {
    return this.db
      .getOrCreateConnection()
      .selectFrom("explanation_audios")
      .selectAll()
      .where("audio_id", "=", audioId)
      .executeTakeFirst();
  }

  async upsert(row: NewExplanationAudios): Promise<ExplanationAudios> {
    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (tx) => {
        await tx
          .deleteFrom("explanation_audios")
          .where("explanation_id", "=", row.explanation_id)
          .where("voice", "=", row.voice)
          .where("language_code", "=", row.language_code)
          .execute();

        return tx
          .insertInto("explanation_audios")
          .values(row)
          .returningAll()
          .executeTakeFirstOrThrow();
      });
  }

  async markStale(explanationId: number): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .updateTable("explanation_audios")
      .set({ is_stale: true })
      .where("explanation_id", "=", explanationId)
      .execute();
  }

  async listStale(olderThan: Date, limit = 500): Promise<ExplanationAudios[]> {
    // Review: push limit into the query so a 10k-stale-row backlog doesn't
    // load the entire set into memory on every cron tick. Caller still
    // slices to its own batch size (100) — this is the outer ceiling.
    return this.db
      .getOrCreateConnection()
      .selectFrom("explanation_audios")
      .selectAll()
      .where("is_stale", "=", true)
      .where("generated_at", "<", olderThan)
      .limit(limit)
      .execute();
  }

  async deleteById(audioId: string): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .deleteFrom("explanation_audios")
      .where("audio_id", "=", audioId)
      .execute();
  }
}

export function storageKeyFor(
  key: AudioVariantKey,
  contentHash: string,
): string {
  return `explanation-audio/${key.explanation_id}/${key.voice}/${key.language_code}/${contentHash}.mp3`;
}

export function contentHashOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
