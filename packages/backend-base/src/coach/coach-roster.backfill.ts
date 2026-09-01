import { db as Database } from "database";
import { sql } from "kysely";

import leaderMapJson from "./coach-leader-map.json";
import coachDataJson from "./coach.data.json";

/**
 * One-time backfill of the roster and the monthly structures out of the
 * deployed `coach.data.json` and into the database (change:
 * port-coach-pipeline, tasks 3.4 and 3.10).
 *
 * Every count it returns is DERIVED from the dataset it was handed, never a
 * literal: the host republishes hourly while the port is in flight, and the
 * roster moved from 16 leaders to 17 (`barry-smitherman`) during this plan's
 * review. A hardcoded figure is stale on arrival, and asserting against one
 * would fail a correct backfill.
 *
 * Idempotent, and deliberately NOT a full overwrite. Attribution keywords are
 * admin-editable once seeded (design open question 6), so a re-run must not
 * revert an admin's edit — `title_match` and `alt_emails` are written only when
 * the stored value is still empty.
 */

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
  admins: number;
  narrativeMonths: number;
  leaderSummaries: number;
}

export async function backfillCoachRoster(
  dataset: unknown = coachDataJson,
  leaderMap: unknown = leaderMapJson,
): Promise<RosterBackfillResult> {
  const conn = Database.getOrCreateConnection();
  const bundle = dataset as Bundle;
  const map = leaderMap as LeaderMap;

  // The leader map keys on a folder name ("Bryan_Bailey"); the roster keys on
  // email, which both sides carry. Matching on the folder name would depend on
  // a slug convention neither file guarantees.
  const attributionByEmail = new Map(
    map.coaches
      .filter((c) => Boolean(c.email))
      .map((c) => [
        (c.email as string).toLowerCase(),
        { title_match: c.title_match ?? [], alt_emails: c.alt_emails ?? [] },
      ]),
  );

  for (const coach of bundle.coaches) {
    const attribution = attributionByEmail.get(coach.email.toLowerCase()) ?? {
      title_match: [],
      alt_emails: [],
    };
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
      ON CONFLICT (email) DO UPDATE SET
        slug         = EXCLUDED.slug,
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
      `.execute(conn);
      leaderSummaries += 1;
    }
  }

  return {
    leaders: bundle.coaches.length,
    admins: (bundle.admins ?? []).length,
    narrativeMonths: narratives.length,
    leaderSummaries,
  };
}

// Runnable: `bun src/coach/coach-roster.backfill.ts`
if (import.meta.main) {
  backfillCoachRoster()
    .then((r) => {
      console.log(
        `Backfilled ${r.leaders} leaders, ${r.admins} admin(s), ` +
          `${r.narrativeMonths} monthly narrative(s), ` +
          `${r.leaderSummaries} leader-month summaries.`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("Roster backfill failed:", err);
      process.exit(1);
    });
}
