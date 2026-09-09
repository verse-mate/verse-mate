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

/** How many transcripts one page asks for. */
const PAGE_LIMIT = 50;

/**
 * How many pages one poll will walk.
 *
 * A bound rather than "until empty", so a provider that never reports a short
 * page cannot spin forever, but high enough that the first run, which asks for
 * the whole history, actually reads it.
 */
const MAX_PAGES_PER_POLL = 20;

/**
 * How far BEFORE the newest thing we have seen the next poll asks from.
 *
 * A watermark set to the newest observation skips anything that lands a moment
 * later, provider timestamps are not monotonic with arrival. The overlap is
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
      // max(SESSION_DATE), not max(observed_at). The watermark is passed as
      // `fromDate`, which filters the PROVIDER's session date, comparing it
      // against our own insertion timestamp mixed two clocks. A session
      // recorded three weeks ago but first observed today pushed the window to
      // "now minus a week", excluding its still-unobserved neighbours forever.
      .select((eb) => eb.fn.max("session_date").as("newest"))
      .executeTakeFirst();
    if (!row?.newest) return null;
    return new Date(new Date(row.newest).getTime() - WATERMARK_OVERLAP_MS);
  }

  async poll(): Promise<PollResult> {
    const since = await this.watermark();

    // PAGE until a short page comes back. One 50-row request was all the poll
    // ever made, with no truncation check, so on the FIRST run (which asks for
    // everything) any history past row 50 became permanently unreachable: the
    // next watermark is far narrower than "everything", and nothing would ever
    // ask for that range again.
    const transcripts: FirefliesTranscript[] = [];
    for (let page = 0; page < MAX_PAGES_PER_POLL; page += 1) {
      const batch = await this.fireflies.listTranscripts({
        since,
        limit: PAGE_LIMIT,
        skip: page * PAGE_LIMIT,
      });
      transcripts.push(...batch);
      if (batch.length < PAGE_LIMIT) break;
      if (page === MAX_PAGES_PER_POLL - 1) {
        // Loudly, because the alternative is losing history in silence.
        console.error(
          `[COACH-INTAKE] page cap reached (${MAX_PAGES_PER_POLL} x ${PAGE_LIMIT}); more history may remain unread`,
        );
      }
    }

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
    // Counted from what was actually INSERTED, not from what the provider
    // returned: reporting a skipped session as observed would have the log
    // claim a session was ingested when nothing was written for it.
    let observed = 0;

    for (const t of fresh) {
      // A malformed provider date used to throw RangeError from inside this
      // loop, aborting the batch: every session after it went uninserted, and
      // the next tick hit the same record again. `dateString` is typed string
      // but comes from an external GraphQL response.
      const date = sessionDate(t);
      if (!date) {
        console.error(
          `[COACH-INTAKE] skipping ${t.id}: unparseable date ${JSON.stringify(t.dateString)}`,
        );
        continue;
      }
      const match = attributeSession(t, roster);
      if (match.matchedBy === "unresolved") unresolved += 1;
      // Strip control characters from the title before it is persisted. It is
      // leader-authored, and it reaches an email SUBJECT line (task 6.3b) and
      // the scoring prompt, a CR/LF in a mail header is an injection
      // primitive, and this is the one boundary the title enters by.
      const title = (t.title ?? "")
        // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .trim();
      await sql`
        INSERT INTO coach_intake_sessions
          (source_session_id, coach_id, matched_by, title, host_email,
           session_date, duration_minutes)
        VALUES (
          ${t.id}, ${match.coachId}, ${match.matchedBy}, ${title},
          NULL, ${date}::date, ${t.duration}
        )
        -- Belt and braces against two workers polling the same window: the
        -- pre-read above is not a lock.
        ON CONFLICT (source_session_id) DO NOTHING
      `.execute(conn);
      observed += 1;
    }

    return {
      observed,
      alreadySeen: transcripts.length - fresh.length,
      unresolved,
    };
  }
}

/**
 * The session's calendar date, formatted rather than passed as a Date.
 *
 * `session_date` is a DATE column; pg parses a Date at LOCAL midnight, so
 * handing it a Date returns the previous day on any UTC+ host, the same bug
 * the report store was fixed for. Taking the ISO day directly avoids the round
 * trip entirely.
 */
function sessionDate(t: FirefliesTranscript): string | null {
  const parsed = new Date(t.dateString);
  // `dateString` is TYPED string but comes from an external GraphQL response.
  // An unparseable one used to throw RangeError from inside the insert loop,
  // aborting the batch: every session after it went uninserted and the next
  // tick hit the same record again.
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}
