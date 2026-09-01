import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { attributeSession, loadAttributionRoster } from "./coach-attribution";
import type { FirefliesClient, FirefliesTranscript } from "./fireflies.client";

/**
 * Session intake (change: port-coach-pipeline, tasks 4.1, 4.2, 4.8).
 *
 * Polls the recording bot team-wide and records every session it sees, so a
 * bot-covered leader's session arrives WITHOUT the leader emailing anything.
 * That is the point of the port: the email path is dropped (design D6), and
 * intake is the only path left.
 */

/** How many transcripts one poll asks for. */
const PAGE_LIMIT = 50;

/**
 * How far BEFORE the newest thing we have seen the next poll asks from.
 *
 * A watermark set to the newest observation skips anything that lands a moment
 * later — provider timestamps are not monotonic with arrival. The overlap is
 * what makes a late arrival visible; the processed-id dedupe below is what
 * stops the overlap producing duplicates. The two are a pair: neither is safe
 * alone.
 */
const WATERMARK_OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;

export interface PollResult {
  /** Sessions recorded for the first time by this poll. */
  observed: number;
  /** Sessions the poll returned that intake already had. */
  alreadySeen: number;
  /** Of the newly observed, how many could not be attributed to a leader. */
  unresolved: number;
}

export class CoachIntakeService {
  constructor(
    private readonly db: db,
    private readonly fireflies: FirefliesClient,
  ) {}

  /**
   * The point the next poll asks from: the newest observation less the overlap,
   * or null when intake has never run (ask for everything once).
   *
   * DERIVED, not stored. A stored cursor and the dedupe set can disagree, and
   * when they do the cursor wins and a session is skipped forever.
   */
  async watermark(): Promise<Date | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_intake_sessions")
      .select((eb) => eb.fn.max("observed_at").as("newest"))
      .executeTakeFirst();
    if (!row?.newest) return null;
    return new Date(new Date(row.newest).getTime() - WATERMARK_OVERLAP_MS);
  }

  async poll(): Promise<PollResult> {
    const since = await this.watermark();
    const transcripts = await this.fireflies.listTranscripts({
      since,
      limit: PAGE_LIMIT,
    });
    if (transcripts.length === 0) {
      return { observed: 0, alreadySeen: 0, unresolved: 0 };
    }

    const conn = this.db.getOrCreateConnection();
    // Dedupe on the SOURCE SESSION id, never on leader+date: a leader may teach
    // twice on one date, and treating that as a duplicate deletes exactly what
    // the widened reports key (task 2.4) exists to preserve.
    const known = new Set(
      (
        await conn
          .selectFrom("coach_intake_sessions")
          .select("source_session_id")
          .where(
            "source_session_id",
            "in",
            transcripts.map((t) => t.id),
          )
          .execute()
      ).map((r) => r.source_session_id),
    );

    const fresh = transcripts.filter((t) => !known.has(t.id));
    if (fresh.length === 0) {
      return { observed: 0, alreadySeen: transcripts.length, unresolved: 0 };
    }

    const roster = await loadAttributionRoster(this.db);
    let unresolved = 0;

    for (const t of fresh) {
      const match = attributeSession(t, roster);
      if (match.matchedBy === "unresolved") unresolved += 1;
      await sql`
        INSERT INTO coach_intake_sessions
          (source_session_id, coach_id, matched_by, title, host_email,
           session_date, duration_minutes)
        VALUES (
          ${t.id}, ${match.coachId}, ${match.matchedBy}, ${t.title ?? ""},
          ${t.host_email}, ${sessionDate(t)}::date, ${t.duration}
        )
        -- Belt and braces against two workers polling the same window: the
        -- pre-read above is not a lock.
        ON CONFLICT (source_session_id) DO NOTHING
      `.execute(conn);
    }

    return {
      observed: fresh.length,
      alreadySeen: transcripts.length - fresh.length,
      unresolved,
    };
  }
}

/**
 * The session's calendar date, formatted rather than passed as a Date.
 *
 * `session_date` is a DATE column; pg parses a Date at LOCAL midnight, so
 * handing it a Date returns the previous day on any UTC+ host — the same bug
 * the report store was fixed for. Taking the ISO day directly avoids the round
 * trip entirely.
 */
function sessionDate(t: FirefliesTranscript): string {
  return new Date(t.dateString).toISOString().slice(0, 10);
}
