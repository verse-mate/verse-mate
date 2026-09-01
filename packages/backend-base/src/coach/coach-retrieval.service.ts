import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import type { CoachArchiveService } from "./coach-archive.service";

/**
 * Holding, retrying and giving up on a session's recording (change:
 * port-coach-pipeline, tasks 4.9 and 4.9a).
 *
 * A recording is often not ready the moment intake sees the session, so a
 * single failed fetch must not condemn it. Equally, retrying forever hides a
 * genuine problem behind a queue that never drains — so the retry budget is
 * STATED, and running out of it is an event with a name and a visible
 * consequence rather than silence.
 *
 * Two rules hold throughout: no audio-only reports, and no report at all
 * without retained source material. A held session produces nothing.
 */

/**
 * Attempts before a held session becomes a retrieval failure.
 *
 * Stated rather than implicit, because 4.9's hold-and-retry and 4.9a's
 * re-share request are the same mechanism seen from two ends: this number is
 * exactly where one becomes the other.
 */
export const RETRIEVAL_ATTEMPT_LIMIT = 5;

export interface PendingReshare {
  sourceSessionId: string;
  coachId: string | null;
  title: string;
  sessionDate: string;
  requestedAt: Date;
  attempts: number;
}

export interface SweepResult {
  attempted: number;
  retained: number;
  held: number;
  failed: number;
}

export class CoachRetrievalService {
  constructor(
    private readonly db: db,
    private readonly archive: Pick<CoachArchiveService, "retain">,
  ) {}

  /**
   * One pass over sessions still waiting for their material.
   *
   * Deliberately does NOT include `retrieval_failed`: those have exhausted the
   * budget and are waiting on a human, and retrying them would both hide that
   * and hammer a provider that has already said no.
   */
  async sweep(): Promise<SweepResult> {
    const conn = this.db.getOrCreateConnection();
    const due = await conn
      .selectFrom("coach_intake_sessions")
      .select(["source_session_id", "retry_count"])
      .where("state", "in", ["observed", "held"])
      .orderBy("observed_at")
      .execute();

    const result: SweepResult = {
      attempted: 0,
      retained: 0,
      held: 0,
      failed: 0,
    };

    for (const session of due) {
      result.attempted += 1;
      const outcome = await this.archive.retain(session.source_session_id);
      if (outcome.retained) {
        result.retained += 1;
        continue; // the archive has already moved it to `retained`
      }

      const attempts = session.retry_count + 1;
      const exhausted = attempts >= RETRIEVAL_ATTEMPT_LIMIT;
      await conn
        .updateTable("coach_intake_sessions")
        .set({
          retry_count: attempts,
          state: exhausted ? "retrieval_failed" : "held",
          // The pending re-share request is persisted at the moment the budget
          // runs out, so the admin surface has something to show and the
          // operator has something to send (task 6.3b).
          ...(exhausted ? { reshare_requested_at: sql`NOW()` } : {}),
          updated_at: sql`NOW()`,
        })
        .where("source_session_id", "=", session.source_session_id)
        .execute();
      if (exhausted) result.failed += 1;
      else result.held += 1;
    }
    return result;
  }

  /** Sessions that ran out of retries and whose re-share is still outstanding. */
  async pendingReshares(): Promise<PendingReshare[]> {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_intake_sessions")
      .select([
        "source_session_id",
        "coach_id",
        "title",
        "retry_count",
        "reshare_requested_at",
      ])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where("state", "=", "retrieval_failed")
      .where("reshare_requested_at", "is not", null)
      .where("reshare_resolved_at", "is", null)
      .orderBy("reshare_requested_at")
      .execute();
    return rows.map((r) => ({
      sourceSessionId: r.source_session_id,
      coachId: r.coach_id,
      title: r.title,
      sessionDate: r.date,
      requestedAt: new Date(r.reshare_requested_at as unknown as string),
      attempts: r.retry_count,
    }));
  }

  /**
   * The way back in. Either trigger clears the failure: an admin marking the
   * request resolved (task 8.5a), or a re-poll observing the recording again.
   *
   * The retry counter RESETS. Leaving it at the limit would make the very next
   * attempt fail the session again, so the re-share would have achieved
   * nothing. Idempotence does the rest: the session keeps its source id, so
   * whatever report it eventually produces upserts on the same natural key and
   * no duplicate appears.
   */
  async resolveReshare(sourceSessionId: string): Promise<boolean> {
    const result = await this.db
      .getOrCreateConnection()
      .updateTable("coach_intake_sessions")
      .set({
        state: "observed",
        retry_count: 0,
        reshare_resolved_at: sql`NOW()`,
        updated_at: sql`NOW()`,
      })
      .where("source_session_id", "=", sourceSessionId)
      .where("state", "=", "retrieval_failed")
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0) > 0;
  }
}
