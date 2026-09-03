import { db as Database } from "database";

import { datasetMeta, datasetToRows } from "./coach-store.transform";
import coachDataJson from "./coach.data.json";

/**
 * One-time backfill of `coach_reports` + `coach_dataset_meta` from the DEPLOYED
 * `coach.data.json` (change: coach-reports-store). Idempotent: upserts on the id
 * (which equals the deployed slug at backfill), so re-running loads the same
 * corpus with no duplicates. Sets the meta report_count from the file's own
 * count, never a hardcoded number.
 *
 * Returns the number of reports loaded so the caller can assert it against the
 * deployed file.
 */
export async function backfillCoachStore(
  dataset: unknown = coachDataJson,
): Promise<{ loaded: number }> {
  const conn = Database.getOrCreateConnection();
  const rows = datasetToRows(dataset);
  const meta = datasetMeta(dataset);

  for (const row of rows) {
    await conn
      .insertInto("coach_reports")
      .values({
        id: row.id,
        coach_id: row.coach_id,
        session_date: row.session_date,
        source_session_id: row.source_session_id,
        legacy_ids: row.legacy_ids,
        summary: row.summary,
        metrics: row.metrics,
        body: row.body,
      })
      // Conflict on the NATURAL key, not the id: a session already ingested
      // under a minted id would otherwise hit the unique index and abort the
      // backfill partway. The key includes source_session_id, so this matches
      // only the row a previous backfill wrote (same deterministic sentinel)
      // and never an ingested session that happens to share the date.
      .onConflict((oc) =>
        oc
          .columns(["coach_id", "session_date", "source_session_id"])
          .doUpdateSet({
            summary: row.summary,
            metrics: row.metrics,
            body: row.body,
            updated_at: new Date(),
          }),
      )
      .execute();
  }

  // Seed the provenance row (single-row table; upsert on the fixed id).
  await conn
    .insertInto("coach_dataset_meta")
    .values({
      id: true,
      version: "1", // bigint column is typed as string by kanel
      report_count: meta.report_count,
      generated_at: meta.generated_at,
      schema_version: meta.schema_version,
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        report_count: meta.report_count,
        generated_at: meta.generated_at,
        schema_version: meta.schema_version,
        updated_at: new Date(),
      }),
    )
    .execute();

  return { loaded: rows.length };
}

// Runnable: `bun src/coach/coach-store.backfill.ts`
if (import.meta.main) {
  backfillCoachStore()
    .then(({ loaded }) => {
      console.log(`Backfilled ${loaded} coach reports.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Backfill failed:", err);
      process.exit(1);
    });
}
