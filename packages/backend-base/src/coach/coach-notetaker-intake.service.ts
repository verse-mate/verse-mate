import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { attributeSession, loadAttributionRoster } from "./coach-attribution";
import { calendarDate } from "./coach-reminder.service";
import { loadRotatingClasses } from "./coach-rotating.service";
import {
  NOTETAKER_SESSION_PREFIX,
  NOTETAKER_SOURCE,
} from "./coach-session-state";
import type { FirefliesClient, FirefliesTranscript } from "./fireflies.client";

/**
 * Intake for the notetaker shadow (COACH_NOTETAKER_SHADOW).
 *
 * Records each class the notetaker exported, attributed by its title exactly
 * as the bot's sessions are (the exports carry no sender address), so the two
 * recordings of one class land on the same leader and date. Deliberately
 * slimmer than the bot's poll:
 *
 *   - no watermark: the gateway lists every export at once, and the id dedupe
 *     is what keeps a session from being recorded twice;
 *   - no legacy floor and no duplicate marking: the shadow is compared with
 *     the bot's copy, it never stands in for it;
 *   - COACH_NOTETAKER_SINCE instead, so the backlog is not scored.
 *
 * Every row is `parallel_run = true` whatever COACH_PIPELINE_LIVE says, and
 * `source = 'notetaker'`, which keeps it out of every path to a leader.
 */

const PAGE_LIMIT = 50;
const MAX_PAGES_PER_POLL = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface NotetakerPollResult {
  /** Sessions recorded for the first time by this poll. */
  observed: number;
  /** Sessions the gateway listed that intake already had. */
  alreadySeen: number;
  /** Of the newly observed, how many no leader or class matched. */
  unresolved: number;
  /** Sessions before COACH_NOTETAKER_SINCE, left out. */
  beforeSince: number;
}

export class CoachNotetakerIntakeService {
  /**
   * @param since YYYY-MM-DD in America/Chicago, or null for every session.
   */
  constructor(
    private readonly db: db,
    private readonly notetaker: FirefliesClient,
    private readonly since: string | null = null,
  ) {}

  async poll(): Promise<NotetakerPollResult> {
    // A day early, so a session on the first day is listed whatever the UTC
    // offset; the exact cut is the calendar date below.
    const listSince = this.since
      ? new Date(Date.parse(`${this.since}T00:00:00Z`) - DAY_MS)
      : null;
    const listed: FirefliesTranscript[] = [];
    for (let page = 0; page < MAX_PAGES_PER_POLL; page += 1) {
      const batch = await this.notetaker.listTranscripts({
        since: listSince,
        limit: PAGE_LIMIT,
        skip: page * PAGE_LIMIT,
      });
      listed.push(...batch);
      if (batch.length < PAGE_LIMIT) break;
      if (page === MAX_PAGES_PER_POLL - 1)
        console.error(
          `[COACH-NOTETAKER-SHADOW] page cap reached (${MAX_PAGES_PER_POLL} x ${PAGE_LIMIT}); later exports wait for COACH_NOTETAKER_SINCE to move`,
        );
    }
    const exports = listed.filter((t) =>
      t.id.startsWith(NOTETAKER_SESSION_PREFIX),
    );
    const result: NotetakerPollResult = {
      observed: 0,
      alreadySeen: 0,
      unresolved: 0,
      beforeSince: 0,
    };
    if (exports.length === 0) return result;

    const conn = this.db.getOrCreateConnection();
    const known = new Set(
      (
        await conn
          .selectFrom("coach_intake_sessions")
          .select("source_session_id")
          .where(
            "source_session_id",
            "in",
            exports.map((t) => t.id),
          )
          .execute()
      ).map((r) => r.source_session_id),
    );
    result.alreadySeen = exports.filter((t) => known.has(t.id)).length;
    const fresh = exports.filter((t) => !known.has(t.id));
    if (fresh.length === 0) return result;

    const roster = await loadAttributionRoster(this.db);
    const rotating = await loadRotatingClasses(this.db);
    for (const t of fresh) {
      const started = new Date(t.dateString);
      if (Number.isNaN(started.getTime())) {
        console.error(
          `[COACH-NOTETAKER-SHADOW] skipping ${t.id}: unparseable date ${JSON.stringify(t.dateString)}`,
        );
        continue;
      }
      const date = calendarDate(started);
      if (this.since && date < this.since) {
        result.beforeSince += 1;
        continue;
      }
      const match = attributeSession(
        { title: t.title, host_email: null, organizer_email: null },
        roster,
        rotating,
      );
      // The same boundary as the bot's title: it reaches the scoring prompt.
      const title = (t.title ?? "").replace(/\p{Cc}+/gu, " ").trim();
      const inserted = await sql`
        INSERT INTO coach_intake_sessions
          (source_session_id, source, coach_id, matched_by, title, host_email,
           session_date, session_started_at, duration_minutes, parallel_run,
           rotating_class_id, state)
        VALUES (
          ${t.id}, ${NOTETAKER_SOURCE}, ${match.coachId}, ${match.matchedBy},
          ${title}, NULL, ${date}::date, ${started.toISOString()}::timestamptz,
          ${t.duration}, true, ${match.rotatingClassId ?? null}, 'observed'
        )
        ON CONFLICT (source_session_id) DO NOTHING
      `.execute(conn);
      if (Number(inserted.numAffectedRows ?? 0) === 0) continue;
      result.observed += 1;
      if (match.matchedBy === "unresolved") result.unresolved += 1;
    }
    return result;
  }
}
