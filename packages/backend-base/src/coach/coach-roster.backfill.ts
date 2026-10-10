import { db as Database } from "database";
import { sql } from "kysely";

import { leaderSlug } from "./coach-attribution";
import leaderMapJson from "./coach-leader-map.json";
import { assertBundleKeepsStore } from "./coach-store.backfill";
import coachDataJson from "./coach.data.json";

interface BundleCoach {
  id: string;
  name: string;
  email: string;
  group?: string;
  coachName?: string;
  isCoach?: boolean;
  zoomLink?: string;
}

interface Bundle {
  coaches: BundleCoach[];
  admins?: string[];
  monthlyNarratives?: Record<
    string,
    { executiveSummary?: unknown; trends?: unknown }
  >;
  monthlyLeaderSummaries?: Record<string, Record<string, unknown>>;
}

interface LeaderMap {
  coaches: Array<{
    leader: string;
    email?: string;
    title_match?: string[];
    alt_emails?: string[];
  }>;
}

/**
 * The one leader the coaching model is benchmarked against. Marked from the
 * roster rather than inferred from session count, which would move the marker
 * whenever another leader out-published him.
 */
const BENCHMARK_LEADER_SLUG = "bryan-bailey";

export interface RosterBackfillResult {
  leaders: number;
  leadersWithoutKeywords: string[];
  admins: number;
  narrativeMonths: number;
  leaderSummaries: number;
}

function attributionFor(
  coach: BundleCoach,
  map: LeaderMap,
): { title_match: string[]; alt_emails: string[] } {
  const email = coach.email.toLowerCase();
  const addresses = (c: LeaderMap["coaches"][number]) =>
    [c.email, ...(c.alt_emails ?? [])]
      .filter((e): e is string => Boolean(e))
      .map((e) => e.toLowerCase());
  const entry =
    map.coaches.find((c) => addresses(c).includes(email)) ??
    map.coaches.find((c) => leaderSlug(c.leader) === coach.id);
  if (!entry) return { title_match: [], alt_emails: [] };
  return {
    title_match: entry.title_match ?? [],
    alt_emails: addresses(entry).filter((e) => e !== email),
  };
}

export async function backfillCoachRoster(
  dataset: unknown = coachDataJson,
  leaderMap: unknown = leaderMapJson,
): Promise<RosterBackfillResult> {
  const conn = Database.getOrCreateConnection();
  await assertBundleKeepsStore(conn, dataset);
  const bundle = dataset as Bundle;
  const map = leaderMap as LeaderMap;

  const leadersWithoutKeywords: string[] = [];
  for (const coach of bundle.coaches) {
    const attribution = attributionFor(coach, map);
    if (attribution.title_match.length === 0)
      leadersWithoutKeywords.push(coach.name);
    await sql`
      UPDATE coach_leaders SET slug = ${coach.id}
      WHERE email = ${coach.email} AND slug IS NULL
    `.execute(conn);
    await sql`
      INSERT INTO coach_leaders
        (slug, email, name, group_name, coach_name, is_coach, zoom_link,
         is_benchmark, title_match, alt_emails)
      VALUES (
        ${coach.id}, ${coach.email}, ${coach.name}, ${coach.group ?? ""},
        ${coach.coachName ?? ""}, ${coach.isCoach ?? true},
        ${coach.zoomLink ?? ""},
        ${coach.id === BENCHMARK_LEADER_SLUG},
        ${sql.val(attribution.title_match)}::text[],
        ${sql.val(attribution.alt_emails)}::text[]
      )
      ON CONFLICT (slug) DO UPDATE SET
        name         = EXCLUDED.name,
        group_name   = EXCLUDED.group_name,
        coach_name   = EXCLUDED.coach_name,
        is_coach     = EXCLUDED.is_coach,
        zoom_link    = EXCLUDED.zoom_link,
        is_benchmark = EXCLUDED.is_benchmark,
        -- Seed only. Once an admin has set keywords, the database is
        -- authoritative and a re-run must not revert their edit.
        title_match  = CASE
          WHEN coach_leaders.title_match = ARRAY[]::text[]
          THEN EXCLUDED.title_match ELSE coach_leaders.title_match END,
        alt_emails   = CASE
          WHEN coach_leaders.alt_emails = ARRAY[]::text[]
          THEN EXCLUDED.alt_emails ELSE coach_leaders.alt_emails END
    `.execute(conn);
  }

  const hasAdmins = await conn
    .selectFrom("coach_admins")
    .select("email")
    .limit(1)
    .executeTakeFirst();
  if (!hasAdmins)
    for (const email of bundle.admins ?? []) {
      await sql`
        INSERT INTO coach_admins (email) VALUES (${email})
        ON CONFLICT (email) DO NOTHING
      `.execute(conn);
    }

  const narratives = Object.entries(bundle.monthlyNarratives ?? {});
  for (const [month, narrative] of narratives) {
    await sql`
      INSERT INTO coach_monthly_narratives (month, executive_summary, trends)
      VALUES (
        ${month},
        ${JSON.stringify(narrative.executiveSummary ?? [])}::jsonb,
        ${JSON.stringify(narrative.trends ?? [])}::jsonb
      )
      ON CONFLICT (month) DO UPDATE SET
        executive_summary = EXCLUDED.executive_summary,
        trends            = EXCLUDED.trends,
        updated_at        = NOW()
      WHERE (coach_monthly_narratives.executive_summary, coach_monthly_narratives.trends)
        IS DISTINCT FROM (EXCLUDED.executive_summary, EXCLUDED.trends)
    `.execute(conn);
  }

  let leaderSummaries = 0;
  for (const [coachId, byMonth] of Object.entries(
    bundle.monthlyLeaderSummaries ?? {},
  )) {
    for (const [month, summary] of Object.entries(byMonth)) {
      await sql`
        INSERT INTO coach_monthly_leader_summaries (coach_id, month, summary)
        VALUES (${coachId}, ${month}, ${JSON.stringify(summary)}::jsonb)
        ON CONFLICT (coach_id, month) DO UPDATE SET
          summary    = EXCLUDED.summary,
          updated_at = NOW()
        WHERE coach_monthly_leader_summaries.summary IS DISTINCT FROM EXCLUDED.summary
      `.execute(conn);
      leaderSummaries += 1;
    }
  }

  return {
    leaders: bundle.coaches.length,
    leadersWithoutKeywords: leadersWithoutKeywords.sort(),
    admins: (bundle.admins ?? []).length,
    narrativeMonths: narratives.length,
    leaderSummaries,
  };
}
