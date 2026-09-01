import type { db } from "../shared/shared.plugin";
import type { FirefliesTranscript } from "./fireflies.client";

/**
 * Attributing a recorded session to a leader (change: port-coach-pipeline,
 * task 4.2).
 *
 * The recording bot files EVERY leader's meeting under ONE shared host address,
 * so the sender cannot identify the leader — the session TITLE does. The
 * keywords live in `coach_leaders` and are admin-editable (open question 6),
 * so fixing a misrouted leader is an UPDATE rather than a deploy.
 *
 * Resolution order, ported from the host: an explicit title keyword, then the
 * leader's full name, then an alternate sender address. Most specific first,
 * because a topic word matches every leader at once — they study the same book
 * in the same week.
 */

export interface AttributionLeader {
  slug: string;
  name: string;
  email: string;
  titleMatch: string[];
  altEmails: string[];
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
  const title = (transcript.title ?? "").toLowerCase();

  // 1. Title keywords, LONGEST first: "saturday morning" must beat "saturday"
  //    when both are configured, or the more specific keyword never wins.
  const keyworded = roster
    .flatMap((leader) =>
      leader.titleMatch.map((keyword) => ({
        leader,
        keyword: keyword.toLowerCase(),
      })),
    )
    .filter(({ keyword }) => keyword.length > 0 && title.includes(keyword))
    .sort((a, b) => b.keyword.length - a.keyword.length);
  if (keyworded.length > 0) {
    return { coachId: keyworded[0].leader.slug, matchedBy: "title_match" };
  }

  // 2. The leader's own name, matched automatically — the host does this too,
  //    so a keyword is only needed when the title does not carry the name.
  const named = roster.find(
    (l) => l.name.length > 0 && title.includes(l.name.toLowerCase()),
  );
  if (named) return { coachId: named.slug, matchedBy: "name" };

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
