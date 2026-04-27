import { db as Database } from "database";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import { AudioService, type AudioVariant } from "./audio.service";

/**
 * TASK-003: replace an explanation's active row with a new version in a
 * single transaction, and schedule eager audio regeneration for any
 * (voice, language_code) variant that had audio previously.
 *
 * Guarantees (br-audio-001, br-audio-002):
 *   - Every existing audio row for the deactivated explanation(s) is
 *     flipped to `is_stale = true` in the SAME transaction as the text
 *     replacement — no moment where a reader sees stale-but-not-marked.
 *   - Jobs are only enqueued AFTER the transaction commits. If the commit
 *     rolls back, no orphan queue work.
 *   - Deduplicates variants across multiple deactivated rows so a
 *     (voice, language_code) pair only re-queues once.
 *   - Uses the deterministic job id from the on-demand path, so a reader
 *     who hits Play in the gap receives the in-flight job id.
 */
export async function replaceExplanationWithAudioHook(params: {
  chapter_id: number;
  type: ExplanationTypeEnum;
  language_code: string;
  new_explanation: string;
  version: number;
  audioService?: AudioService;
}): Promise<{ newExplanationId: number; enqueuedJobIds: string[] }> {
  const audioService =
    params.audioService ??
    new AudioService(Database, new ObjectStorageService());

  const { newExplanationId, variants } = await Database.getOrCreateConnection()
    .transaction()
    .execute(async (trx) => {
      const toDeactivate = await trx
        .selectFrom("explanations")
        .select("explanation_id")
        .where("chapter_id", "=", params.chapter_id)
        .where("type", "=", params.type)
        .where("language_code", "=", params.language_code)
        .where("is_active", "=", true)
        .execute();

      const allVariants: AudioVariant[] = [];
      for (const row of toDeactivate) {
        const vs = await audioService.markStaleAndCollectVariants(
          row.explanation_id,
          trx,
        );
        allVariants.push(...vs);
      }

      await trx
        .updateTable("explanations")
        .set({ is_active: false })
        .where("chapter_id", "=", params.chapter_id)
        .where("type", "=", params.type)
        .where("language_code", "=", params.language_code)
        .execute();

      const inserted = await trx
        .insertInto("explanations")
        .values({
          type: params.type,
          explanation: params.new_explanation,
          chapter_id: params.chapter_id,
          language_code: params.language_code,
          version: params.version,
          is_active: true,
          created_at: new Date(),
        })
        .returning("explanation_id")
        .executeTakeFirstOrThrow();

      const uniqueVariants = Array.from(
        new Map(
          allVariants.map((v) => [`${v.voice}:${v.language_code}`, v]),
        ).values(),
      );

      return {
        newExplanationId: inserted.explanation_id,
        variants: uniqueVariants,
      };
    });

  const enqueuedJobIds = await audioService.enqueueRegenForVariants(
    newExplanationId,
    variants,
  );

  return { newExplanationId, enqueuedJobIds };
}
