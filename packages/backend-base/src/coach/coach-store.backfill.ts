import { db as Database } from "database";
import { sql } from "kysely";

import { datasetMeta, datasetToRows } from "./coach-store.transform";
import coachDataJson from "./coach.data.json";

type Executor = ReturnType<typeof Database.getOrCreateConnection>;

export async function assertBundleKeepsStore(
  conn: Executor,
  dataset: unknown,
): Promise<void> {
  const bundle = dataset as {
    coaches?: Array<{ id: string }>;
    monthlyLeaderSummaries?: Record<string, Record<string, unknown>>;
  };
  const roster = (bundle.coaches ?? []).map((c) => c.id);
  if (roster.length === 0) return;

  const bundleReports = new Map<string, number>();
  for (const row of datasetToRows(dataset)) {
    bundleReports.set(row.coach_id, (bundleReports.get(row.coach_id) ?? 0) + 1);
  }
  const storeReports = new Map(
    (
      await conn
        .selectFrom("coach_reports")
        .select(sql<string>`split_part(source_session_id, ':', 2)`.as("leader"))
        .select((eb) => eb.fn.countAll<string>().as("n"))
        .where("source_session_id", "like", "legacy:%")
        .groupBy(sql`split_part(source_session_id, ':', 2)`)
        .execute()
    ).map((r) => [r.leader, Number(r.n)]),
  );
  const storeSummaries = new Map(
    (
      await conn
        .selectFrom("coach_monthly_leader_summaries")
        .select("coach_id")
        .select((eb) => eb.fn.countAll<string>().as("n"))
        .where("coach_id", "in", roster)
        .groupBy("coach_id")
        .execute()
    ).map((r) => [r.coach_id, Number(r.n)]),
  );

  const shortfalls: string[] = [];
  for (const leader of roster) {
    const reports = bundleReports.get(leader) ?? 0;
    const storedReports = storeReports.get(leader) ?? 0;
    if (reports < storedReports) {
      shortfalls.push(
        `${leader}: ${reports} reports in the bundle, ${storedReports} in the store`,
      );
    }
    const summaries = Object.keys(
      bundle.monthlyLeaderSummaries?.[leader] ?? {},
    ).length;
    const storedSummaries = storeSummaries.get(leader) ?? 0;
    if (summaries < storedSummaries) {
      shortfalls.push(
        `${leader}: ${summaries} leader-month summaries in the bundle, ${storedSummaries} in the store`,
      );
    }
  }
  if (shortfalls.length > 0) {
    throw new Error(
      `Backfill refused, nothing was written: this bundle would leave leaders with less than the store holds. ${shortfalls.join("; ")}.`,
    );
  }
}

export async function backfillCoachStore(
  dataset: unknown = coachDataJson,
): Promise<{ loaded: number }> {
  const conn = Database.getOrCreateConnection();
  const rows = datasetToRows(dataset);
  const meta = datasetMeta(dataset);

  await conn.transaction().execute(async (trx) => {
    await assertBundleKeepsStore(trx as Executor, dataset);

    let changed = false;
    for (const row of rows) {
      const written = await trx
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
        .onConflict((oc) =>
          oc
            .column("source_session_id")
            .doUpdateSet({
              summary: row.summary,
              metrics: row.metrics,
              body: row.body,
              updated_at: new Date(),
            })
            .where(
              sql`(coach_reports.summary, coach_reports.metrics, coach_reports.body)`,
              "is distinct from",
              sql`(excluded.summary, excluded.metrics, excluded.body)`,
            ),
        )
        .executeTakeFirst();
      if (Number(written.numInsertedOrUpdatedRows ?? 0) > 0) changed = true;
    }

    if (changed)
      await trx
        .insertInto("coach_dataset_meta")
        .values({
          id: true,
          version: "1",
          report_count: meta.report_count,
          generated_at: meta.generated_at,
          schema_version: meta.schema_version,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            version: sql`coach_dataset_meta.version + 1`,
            report_count: sql`GREATEST(coach_dataset_meta.report_count, ${meta.report_count})`,
            generated_at: meta.generated_at,
            schema_version: meta.schema_version,
            updated_at: new Date(),
          }),
        )
        .execute();
  });

  return { loaded: rows.length };
}
