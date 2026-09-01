import { db as Database } from "database";

import { rowToReport } from "./coach-store.transform";
import { CoachReportsRepository } from "./repository/coach-reports.repository";
import { CLUSTERS, RUBRIC_MODEL_VERSION, STATUS_BANDS } from "./rubric";

/**
 * Snapshot the database back into the bundled `coach.data.json` shape
 * (change: port-coach-pipeline, task 2.9).
 *
 * This is the rollback path, and it has to rebuild the WHOLE dataset. The
 * harvested version emitted only `coaches[].reports`, on the assumption that
 * the roster, admins, monthly structures and rubric still lived in the bundle
 * and the caller would merge into the existing file. After group 3 they live in
 * the database, and after task 7.1 there is no file left to merge into — so a
 * reports-only export would leave step 10 of the migration plan with no
 * rollback at all.
 *
 * Usage: `bun src/coach/coach-store.snapshot.ts > coach.data.json`
 */

export interface CoachDatasetSnapshot {
  schemaVersion: number | null;
  generatedAt: string | null;
  model: string;
  admins: string[];
  clusters: Array<{ name: string; weight: number }>;
  statusBands: Array<{ min: number; label: string; emoji: string }>;
  coaches: Array<Record<string, unknown>>;
  monthlyNarratives: Record<string, unknown>;
  monthlyLeaderSummaries: Record<string, Record<string, unknown>>;
}

export async function snapshotReportsByCoach(): Promise<
  Record<string, Record<string, unknown>[]>
> {
  const repo = new CoachReportsRepository(Database);
  const byCoach: Record<string, Record<string, unknown>[]> = {};
  // One query for the ids, then one per coach — never one per report.
  for (const coachId of await repo.listCoachIds()) {
    const reports = (await repo.listFullReports(coachId)).map((detail) =>
      rowToReport({
        id: detail.id,
        session_date: detail.date,
        summary: detail.summary,
        metrics: detail.metrics,
        body: detail.body,
      }),
    );
    // The bundle contract is newest-first per coach.
    reports.sort((a, b) => (String(a.date) < String(b.date) ? 1 : -1));
    byCoach[coachId] = reports;
  }
  return byCoach;
}

export async function snapshotDataset(): Promise<CoachDatasetSnapshot> {
  const conn = Database.getOrCreateConnection();
  const repo = new CoachReportsRepository(Database);

  const [meta, reportsByCoach, leaders, admins, narratives, leaderSummaries] =
    await Promise.all([
      repo.getMeta(),
      snapshotReportsByCoach(),
      conn
        .selectFrom("coach_leaders")
        .select([
          "slug",
          "name",
          "email",
          "group_name",
          "coach_name",
          "is_coach",
          "zoom_link",
        ])
        .where("slug", "is not", null)
        .orderBy("slug")
        .execute(),
      conn
        .selectFrom("coach_admins")
        .select("email")
        .orderBy("email")
        .execute(),
      conn
        .selectFrom("coach_monthly_narratives")
        .select(["month", "executive_summary", "trends"])
        .orderBy("month", "desc")
        .execute(),
      conn
        .selectFrom("coach_monthly_leader_summaries")
        .select(["coach_id", "month", "summary"])
        .orderBy("coach_id")
        .orderBy("month", "desc")
        .execute(),
    ]);

  const monthlyNarratives: Record<string, unknown> = {};
  for (const n of narratives) {
    monthlyNarratives[n.month] = {
      executiveSummary: n.executive_summary,
      trends: n.trends,
    };
  }

  const monthlyLeaderSummaries: Record<string, Record<string, unknown>> = {};
  for (const s of leaderSummaries) {
    const byMonth = monthlyLeaderSummaries[s.coach_id] ?? {};
    byMonth[s.month] = s.summary;
    monthlyLeaderSummaries[s.coach_id] = byMonth;
  }

  return {
    schemaVersion: meta?.schemaVersion ?? null,
    generatedAt: meta?.generatedAt ?? null,
    // The rubric is served from its single definition, not stored per dataset:
    // re-reading it here would just be a second copy to drift.
    model: RUBRIC_MODEL_VERSION,
    admins: admins.map((a) => a.email),
    clusters: CLUSTERS.map((c) => ({ ...c })),
    statusBands: STATUS_BANDS.map((b) => ({ ...b })),
    coaches: leaders.map((l) => ({
      id: l.slug as string,
      name: l.name,
      email: l.email,
      group: l.group_name,
      coachName: l.coach_name,
      isCoach: l.is_coach,
      zoomLink: l.zoom_link,
      reports: reportsByCoach[l.slug as string] ?? [],
    })),
    monthlyNarratives,
    monthlyLeaderSummaries,
  };
}

if (import.meta.main) {
  snapshotDataset()
    .then((dataset) => {
      const total = dataset.coaches.reduce(
        (n, c) => n + (c.reports as unknown[]).length,
        0,
      );
      console.error(
        `Snapshotted ${total} report(s) across ${dataset.coaches.length} leader(s), ` +
          `${dataset.admins.length} admin(s), ` +
          `${Object.keys(dataset.monthlyNarratives).length} monthly narrative(s).`,
      );
      console.log(JSON.stringify(dataset, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("Snapshot failed:", err);
      process.exit(1);
    });
}
