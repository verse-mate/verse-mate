import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { ObjectStorageService } from "../shared/storage/storage.service";

/**
 * Bounded retention of session material (change: port-coach-pipeline,
 * task 4.6).
 *
 * Matches the policy the retired host ran: keep a leader's four most recent
 * recordings, and no more. Video is the expensive thing to store and the least
 * often revisited; a transcript is small and is the evidence a score is
 * defended with, so it is NOT pruned and lives as long as its report.
 *
 * The third rule — a session's material goes when its report is deleted — is
 * not implemented here at all. It is an ON DELETE CASCADE in migration 7, so
 * it is a database guarantee rather than a step someone has to remember to
 * call.
 */

/** How many recordings a leader keeps. The host's policy, ported. */
export const RECORDINGS_KEPT_PER_LEADER = 4;

export interface PruneResult {
  /** Assets whose bytes AND row are gone. */
  deleted: number;
  /** Assets whose object delete failed; their rows are left for a retry. */
  failed: number;
}

export class CoachRetentionService {
  private readonly storage: Pick<ObjectStorageService, "deleteObject">;

  constructor(
    private readonly db: db,
    storage?: Pick<ObjectStorageService, "deleteObject">,
  ) {
    this.storage = storage ?? new ObjectStorageService();
  }

  async prune(): Promise<PruneResult> {
    const conn = this.db.getOrCreateConnection();

    // Rank each leader's recordings newest-first and take everything past the
    // bound. Ranked in SQL rather than by loading every asset and sorting in
    // memory — this runs against the whole corpus. Raw, because this kysely
    // version has no window-function builder.
    const doomed = await sql<{ id: string; storage_key: string }>`
      SELECT id, storage_key FROM (
        SELECT id, storage_key,
               row_number() OVER (
                 PARTITION BY coach_id ORDER BY created_at DESC
               ) AS rank
        FROM coach_session_assets
        WHERE kind = 'recording'
      ) ranked
      WHERE rank > ${RECORDINGS_KEPT_PER_LEADER}
    `.execute(conn);

    let deleted = 0;
    let failed = 0;
    for (const asset of doomed.rows) {
      const ok = await this.storage.deleteObject(asset.storage_key);
      if (!ok) {
        // Leave the row. Deleting it while the bytes survive orphans them
        // permanently — nothing would ever name that key again.
        failed += 1;
        continue;
      }
      await conn
        .deleteFrom("coach_session_assets")
        .where("id", "=", asset.id)
        .execute();
      deleted += 1;
    }
    return { deleted, failed };
  }
}
