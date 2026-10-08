import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { rescorable } from "./coach-session-state";
import type { FirefliesTranscript } from "./fireflies.client";

/**
 * Attributing a recorded session to a leader (change: port-coach-pipeline,
 * task 4.2).
 *
 * The recording bot files EVERY leader's meeting under ONE shared host address,
 * so the sender cannot identify the leader, the session TITLE does. The
 * keywords live in `coach_leaders` and are admin-editable (open question 6),
 * so fixing a misrouted leader is an UPDATE rather than a deploy.
 *
 * Resolution order, ported from the host: an explicit title keyword, then the
 * leader's full name, then an alternate sender address. Most specific first,
 * because a topic word matches every leader at once, they study the same book
 * in the same week.
 */

export interface AttributionLeader {
  slug: string;
  name: string;
  email: string;
  titleMatch: string[];
  altEmails: string[];
}

export function leaderSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleWords(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function containsWords(haystack: string, needle: string): boolean {
  return needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);
}

export type MatchedBy = "title_match" | "name" | "alt_email" | "unresolved";

export interface Attribution {
  coachId: string | null;
  matchedBy: MatchedBy;
}

export async function loadAttributionRoster(
  database: db,
): Promise<AttributionLeader[]> {
  const rows = await database
    .getOrCreateConnection()
    .selectFrom("coach_leaders")
    .select(["slug", "name", "email", "title_match", "alt_emails"])
    .where("slug", "is not", null)
    .where("is_coach", "=", true)
    // ORDERED. Without it the roster arrives in Postgres heap order, and
    // Array.sort being stable meant two equal-length keyword matches were
    // resolved by physical row position, so an unrelated UPDATE could
    // silently re-attribute a session from one leader to another, and once
    // delivery is wired that emails one leader's report to a different leader.
    .orderBy("slug")
    .execute();
  return rows.map((r) => ({
    slug: r.slug as string,
    name: r.name,
    email: r.email,
    titleMatch: r.title_match ?? [],
    altEmails: r.alt_emails ?? [],
  }));
}

export function attributeSession(
  transcript: Pick<
    FirefliesTranscript,
    "title" | "host_email" | "organizer_email"
  >,
  roster: AttributionLeader[],
): Attribution {
  const title = titleWords(transcript.title ?? "");

  // 1. Title keywords, LONGEST first: "saturday morning" must beat "saturday"
  //    when both are configured, or the more specific keyword never wins.
  const keyworded = roster
    .flatMap((leader) =>
      leader.titleMatch.map((keyword) => ({
        leader,
        keyword: titleWords(keyword),
      })),
    )
    .filter(({ keyword }) => containsWords(title, keyword))
    .sort((a, b) => b.keyword.length - a.keyword.length);
  if (keyworded.length > 0) {
    // AMBIGUITY IS UNRESOLVED, not a coin toss. Two leaders can both list
    // "saturday", nothing at the schema or app level prevents it, and
    // picking one by roster order attributes a leader's private session to
    // someone else with nothing flagged. `unresolved` is the safe,
    // admin-fixable state the design already provides for exactly this.
    const best = keyworded[0].keyword.length;
    const tied = new Set(
      keyworded
        .filter((k) => k.keyword.length === best)
        .map((k) => k.leader.slug),
    );
    if (tied.size > 1) return { coachId: null, matchedBy: "unresolved" };
    return { coachId: keyworded[0].leader.slug, matchedBy: "title_match" };
  }

  // 2. The leader's own name, matched automatically, the host does this too,
  //    so a keyword is only needed when the title does not carry the name.
  const named = roster.filter((l) => containsWords(title, titleWords(l.name)));
  // Same rule for names: "Study with Jeff Ward and Jeff Warden" names two
  // leaders, and guessing is worse than asking.
  if (named.length > 1) return { coachId: null, matchedBy: "unresolved" };
  if (named.length === 1) {
    return { coachId: named[0].slug, matchedBy: "name" };
  }

  // 3. An alternate sender address, for a leader who appears under more than
  //    one. The shared bot host address matches nobody, by construction.
  const senders = [transcript.host_email, transcript.organizer_email]
    .filter((e): e is string => Boolean(e))
    .map((e) => e.toLowerCase());
  const byAddress = roster.find((l) =>
    [l.email, ...l.altEmails]
      .map((e) => e.toLowerCase())
      .some((e) => senders.includes(e)),
  );
  if (byAddress) return { coachId: byAddress.slug, matchedBy: "alt_email" };

  // Unattributable sessions still INGEST and are flagged, never dropped: an
  // admin adds a keyword and the session resolves, which a dropped session
  // could never do.
  return { coachId: null, matchedBy: "unresolved" };
}

export const REATTRIBUTED_HOLD =
  "re-attributed: held until an admin releases it";

export const UNRESOLVED_SWEEP_DAYS = 90;
export const UNRESOLVED_SWEEP_LIMIT = 500;

export async function reattributeUnresolved(
  database: db,
  bounds: { limit?: number } = {},
): Promise<number> {
  const conn = database.getOrCreateConnection();
  const unresolved = await conn
    .selectFrom("coach_intake_sessions")
    .select(["source_session_id", "title"])
    .where("coach_id", "is", null)
    .where(
      "observed_at",
      ">=",
      sql<Date>`NOW() - make_interval(days => ${UNRESOLVED_SWEEP_DAYS})`,
    )
    .orderBy("observed_at", "desc")
    .limit(bounds.limit ?? UNRESOLVED_SWEEP_LIMIT)
    .execute();
  if (unresolved.length === 0) return 0;
  const roster = await loadAttributionRoster(database);
  let resolved = 0;
  for (const session of unresolved) {
    const match = attributeSession(
      { title: session.title, host_email: null, organizer_email: null },
      roster,
    );
    if (!match.coachId) continue;
    const updated = await conn
      .updateTable("coach_intake_sessions")
      .set({
        coach_id: match.coachId,
        matched_by: match.matchedBy,
        release_required: true,
        updated_at: sql`NOW()`,
      })
      .where("source_session_id", "=", session.source_session_id)
      .where("coach_id", "is", null)
      .executeTakeFirst();
    resolved += Number(updated.numUpdatedRows ?? 0);
  }
  return resolved;
}

export async function getLeaderAttribution(
  database: db,
  slug: string,
): Promise<{ titleMatch: string[]; altEmails: string[] } | null> {
  const row = await database
    .getOrCreateConnection()
    .selectFrom("coach_leaders")
    .select(["title_match", "alt_emails"])
    .where("slug", "=", slug)
    .executeTakeFirst();
  if (!row) return null;
  return { titleMatch: row.title_match ?? [], altEmails: row.alt_emails ?? [] };
}

export interface KeywordConflict {
  keyword: string;
  leader: string;
  inside: "keyword" | "name";
}

export function withLeaderKeywordLock<T>(
  database: db,
  work: (scoped: db) => Promise<T>,
): Promise<T> {
  return database
    .getOrCreateConnection()
    .transaction()
    .execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext('coach_leader_keywords'))`.execute(
        trx,
      );
      return work({ getOrCreateConnection: () => trx } as unknown as db);
    });
}

export async function keywordsInName(
  database: db,
  name: string,
): Promise<Array<{ keyword: string; leader: string }>> {
  const words = titleWords(name);
  const leaders = await database
    .getOrCreateConnection()
    .selectFrom("coach_leaders")
    .select(["slug", "title_match"])
    .where("slug", "is not", null)
    .where("is_coach", "=", true)
    .orderBy("slug")
    .execute();
  return leaders.flatMap((leader) =>
    (leader.title_match ?? [])
      .filter((keyword) => containsWords(words, titleWords(keyword)))
      .map((keyword) => ({ keyword, leader: leader.slug as string })),
  );
}

export async function setLeaderAttribution(
  database: db,
  slug: string,
  input: { titleMatch: string[]; altEmails: string[] },
): Promise<
  | { ok: true; titleMatch: string[]; altEmails: string[]; resolved: number }
  | { ok: false; refusal: "unknown-leader" }
  | { ok: false; refusal: "keyword-conflict"; conflicts: KeywordConflict[] }
> {
  const normalized = (values: string[]) => [
    ...new Set(
      values
        .map((v) => v.trim().replace(/\s+/g, " ").toLowerCase())
        .filter(Boolean),
    ),
  ];
  const titleMatch = normalized(input.titleMatch);
  const altEmails = normalized(input.altEmails);
  const saved = await withLeaderKeywordLock(database, async (scoped) => {
    const conn = scoped.getOrCreateConnection();
    const others = await conn
      .selectFrom("coach_leaders")
      .select(["slug", "name", "title_match"])
      .where("slug", "is not", null)
      .where("slug", "!=", slug)
      .where("is_coach", "=", true)
      .orderBy("slug")
      .execute();
    const conflicts: KeywordConflict[] = [];
    for (const keyword of titleMatch) {
      const words = titleWords(keyword);
      for (const other of others) {
        const leader = other.slug as string;
        if (
          (other.title_match ?? []).some((k) =>
            containsWords(titleWords(k), words),
          )
        )
          conflicts.push({ keyword, leader, inside: "keyword" });
        else if (containsWords(titleWords(other.name), words))
          conflicts.push({ keyword, leader, inside: "name" });
      }
    }
    if (conflicts.length > 0)
      return {
        ok: false as const,
        refusal: "keyword-conflict" as const,
        conflicts,
      };
    const updated = await conn
      .updateTable("coach_leaders")
      .set({
        title_match: sql`${sql.val(titleMatch)}::text[]`,
        alt_emails: sql`${sql.val(altEmails)}::text[]`,
      })
      .where("slug", "=", slug)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0)
      return { ok: false as const, refusal: "unknown-leader" as const };
    return null;
  });
  if (saved) return saved;
  return {
    ok: true,
    titleMatch,
    altEmails,
    resolved: await reattributeUnresolved(database),
  };
}

export async function reattributeSession(
  database: db,
  sourceSessionId: string,
  coachId: string,
  expectedCoachId: string | null,
): Promise<
  | { ok: true; state: string }
  | {
      ok: false;
      refusal:
        | "unknown-leader"
        | "unknown-session"
        | "in-flight"
        | "attribution-changed"
        | "already-assigned";
    }
> {
  return database
    .getOrCreateConnection()
    .transaction()
    .execute(async (trx) => {
      const leader = await trx
        .selectFrom("coach_leaders")
        .select("slug")
        .where("slug", "=", coachId)
        .where("is_coach", "=", true)
        .executeTakeFirst();
      if (!leader) return { ok: false, refusal: "unknown-leader" } as const;
      const session = await trx
        .selectFrom("coach_intake_sessions")
        .select(["state", "report_id", "coach_id"])
        .where("source_session_id", "=", sourceSessionId)
        .forUpdate()
        .executeTakeFirst();
      if (!session) return { ok: false, refusal: "unknown-session" } as const;
      if (session.coach_id !== expectedCoachId)
        return { ok: false, refusal: "attribution-changed" } as const;
      if (session.coach_id === coachId)
        return { ok: false, refusal: "already-assigned" } as const;
      if (session.state === "delivering")
        return { ok: false, refusal: "in-flight" } as const;

      const rescore = rescorable(session.state);
      const state = rescore ? "retained" : session.state;
      await trx
        .updateTable("coach_intake_sessions")
        .set({
          coach_id: coachId,
          matched_by: "admin",
          release_required: true,
          state,
          ...(rescore
            ? {
                retry_count: 0,
                hold_reason: null,
                delivered_to: sql`ARRAY[]::text[]`,
                published: false,
                attempted_to: sql`ARRAY[]::text[]`,
              }
            : {}),
          updated_at: sql`NOW()`,
        })
        .where("source_session_id", "=", sourceSessionId)
        .execute();
      await trx
        .updateTable("coach_session_assets")
        .set({ coach_id: coachId })
        .where("source_session_id", "=", sourceSessionId)
        .execute();
      if (session.report_id) {
        await trx
          .updateTable("coach_reports")
          .set({ coach_id: coachId, held: true, updated_at: sql`NOW()` })
          .where("id", "=", session.report_id)
          .execute();
        await trx
          .updateTable("coach_report_dimension_scores")
          .set({ provenance: "machine", corrected_by: null })
          .where("report_id", "=", session.report_id)
          .where("provenance", "=", "human")
          .execute();
        await trx
          .updateTable("coach_reports")
          .set({ first_lesson: false, first_lesson_source: null })
          .where("id", "=", session.report_id)
          .where("first_lesson_source", "=", "admin")
          .execute();
        for (const table of ["coach_notes", "coach_recording_links"] as const)
          await trx
            .updateTable(table)
            .set({ coach_id: coachId })
            .where("report_id", "=", session.report_id)
            .execute();
      }
      return { ok: true, state } as const;
    });
}
