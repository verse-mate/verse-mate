import type { db } from "../../shared/shared.plugin";
import type { ObjectStorageService } from "../../shared/storage/storage.service";
import {
  AUDIO_CLEANUP_BATCH_SIZE,
  AUDIO_CLEANUP_MIN_STALE_MS,
} from "./audio-cleanup.queue";
import { AudioRepository } from "./audio.repository";

export interface AudioCleanupResult {
  deleted_count: number;
  failed_count: number;
  scanned_count: number;
  duration_ms: number;
}

export interface AudioCleanupLogger {
  info?(message: string, metadata?: Record<string, unknown>): void;
  error?(message: string, metadata?: Record<string, unknown>): void;
}

/**
 * TASK-004: scans for `explanation_audios` rows that were marked stale
 * (by TASK-003's hook or any future code path) and have been stale for
 * at least AUDIO_CLEANUP_MIN_STALE_MS. For each matching row:
 *
 *   - Attempt to delete the S3/MinIO object at `storage_key`.
 *   - On success, delete the DB row.
 *   - On failure, leave the DB row untouched — the next run will retry.
 *
 * This preserves br-audio-002 atomicity: storage and DB state never
 * diverge "toward deleted". Either both are still present, or both are
 * gone. A half-deleted row (S3 gone, DB still there) is the retry state
 * and is safe: the next `deleteObject` call will be a no-op on S3, and
 * the DB row will then be removed.
 */
export class AudioCleanupService {
  private readonly repository: AudioRepository;

  constructor(
    private readonly db: db,
    private readonly storage: ObjectStorageService,
    private readonly logger: AudioCleanupLogger = {},
    repository?: AudioRepository,
  ) {
    this.repository = repository ?? new AudioRepository(db);
  }

  async runCleanup(
    options: {
      olderThan?: Date;
      batchSize?: number;
    } = {},
  ): Promise<AudioCleanupResult> {
    const startedAt = Date.now();
    const cutoff =
      options.olderThan ?? new Date(Date.now() - AUDIO_CLEANUP_MIN_STALE_MS);
    const batchSize = options.batchSize ?? AUDIO_CLEANUP_BATCH_SIZE;

    const rows = (await this.repository.listStale(cutoff)).slice(0, batchSize);

    let deleted = 0;
    let failed = 0;

    for (const row of rows) {
      const storageDeleted = await this.storage.deleteObject(row.storage_key);
      if (!storageDeleted) {
        failed += 1;
        this.logger.error?.(
          `[AUDIO-CLEANUP] Storage delete failed for ${row.audio_id}; DB row kept for retry`,
          { audio_id: row.audio_id, storage_key: row.storage_key },
        );
        continue;
      }

      try {
        await this.repository.deleteById(row.audio_id);
        deleted += 1;
      } catch (error) {
        // S3 object is gone but DB delete failed. Next run will find
        // the row again; deleteObject will return true (key already
        // missing), and deleteById can retry.
        failed += 1;
        this.logger.error?.(
          `[AUDIO-CLEANUP] DB delete failed for ${row.audio_id} after S3 delete succeeded`,
          {
            audio_id: row.audio_id,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    const duration_ms = Date.now() - startedAt;

    this.logger.info?.("[AUDIO-CLEANUP] run complete", {
      event: "AUDIO_CLEANUP_RAN",
      scanned_count: rows.length,
      deleted_count: deleted,
      failed_count: failed,
      duration_ms,
    });

    return {
      scanned_count: rows.length,
      deleted_count: deleted,
      failed_count: failed,
      duration_ms,
    };
  }
}
