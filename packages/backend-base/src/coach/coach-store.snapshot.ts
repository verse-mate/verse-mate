import { db as Database } from "database";

import { rowToReport } from "./coach-store.transform";
import { CoachReportsRepository } from "./repository/coach-reports.repository";

/**
 * Snapshot the report store back into the bundled `coach.data.json` shape
 * (change: coach-reports-store, task 5.2a).
 *
 * This is the rollback path. Once the store has accepted a report that was
 * never in the bundle, reverting reads to the bundled array would silently lose
 * that session — so a store→bundle export is required, not optional. Run it
 * before disabling the store read path.
 *
 * It rebuilds only the `coaches[].reports` arrays; the roster, admins, monthly
 * narratives and rubric still live in the bundle (they move in a later change),
 * so the caller merges this into the existing file rather than replacing it.
 *
 * Usage: `bun src/coach/coach-store.snapshot.ts > snapshot.json`
 */
export async function snapshotReportsByCoach(): Promise<
  Record<string, Record<string, unknown>[]>
> {
  const repo = new CoachReportsRepository(Database);
  const all = await repo.listAllMetrics();
  const byCoach: Record<string, Record<string, unknown>[]> = {};
  // One query per coach (not per report) — the per-report loop was an N+1.
  const coachIds = [...new Set(all.map((r) => r.coachId))];
  const detailsByCoach = new Map<
    string,
    Awaited<ReturnType<typeof repo.listFullReports>>
  >();
  for (const coachId of coachIds) {
    detailsByCoach.set(coachId, await repo.listFullReports(coachId));
  }

  for (const [coachId, details] of detailsByCoach) {
    for (const detail of details) {
      const row = { coachId };
      const report = rowToReport({
        id: detail.id,
        session_date: detail.date,
        summary: detail.summary,
        metrics: detail.metrics,
        body: detail.body,
      });
      const bucket = byCoach[row.coachId] ?? [];
      bucket.push(report);
      byCoach[row.coachId] = bucket;
    }
  }

  // The bundle contract is newest-first per coach.
  for (const reports of Object.values(byCoach)) {
    reports.sort((a, b) => (String(a.date) < String(b.date) ? 1 : -1));
  }
  return byCoach;
}

if (import.meta.main) {
  snapshotReportsByCoach()
    .then((byCoach) => {
      const total = Object.values(byCoach).reduce((n, r) => n + r.length, 0);
      console.error(
        `Snapshotted ${total} report(s) across ${Object.keys(byCoach).length} coach(es).`,
      );
      console.log(JSON.stringify(byCoach, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("Snapshot failed:", err);
      process.exit(1);
    });
}
