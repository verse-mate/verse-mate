import { sql } from "kysely";

import type { db } from "../../shared/shared.plugin";
import type { CoachReportRow } from "../coach-store.transform";

/** A report's list-view row: the summary jsonb plus its identity. */
export interface ReportSummaryRow {
  id: string;
  coachId: string;
  date: string;
  summary: Record<string, unknown>;
}

/** A report's full detail: summary + metrics + body, joined at read time. */
export interface ReportDetailRow extends ReportSummaryRow {
  metrics: Record<string, unknown>;
  body: Record<string, unknown>;
}

/** The dataset provenance row (single-row table). */
export interface DatasetMetaRow {
  version: string;
  reportCount: number;
  generatedAt: string | null;
  schemaVersion: number | null;
}

/** Result of one report upsert: the id the store assigned or matched. */
export interface UpsertedReport {
  id: string;
  coachId: string;
  date: string;
  created: boolean;
}

/** Dates come back as Date from pg; the JSON contract is yyyy-mm-dd strings. */
function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Data access for the coach report store (change: coach-reports-store).
 *
 * Reports live in `coach_reports`, keyed by an immutable `id` (the deployed
 * slug for backfilled rows, an opaque value for reports published later) and
 * matched across publishes by the title-free natural key
 * `(coach_id, session_date)`. Reads are split so a list never carries prose:
 * `listSummaries` reads only `summary`, `getDetail` adds `metrics` + `body`,
 * and `listMetrics` feeds trends/monthly aggregation without loading prose.
 */
export class CoachReportsRepository {
  constructor(private readonly db: db) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  /** One page of a coach's sessions, newest first. Prose is NOT loaded. */
  async listSummaries(
    coachId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<ReportSummaryRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "session_date", "summary"])
      .where("coach_id", "=", coachId)
      .orderBy("session_date", "desc")
      .limit(limit)
      .offset(offset)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      coachId: r.coach_id,
      date: isoDate(r.session_date),
      summary: (r.summary ?? {}) as Record<string, unknown>,
    }));
  }

  /** How many sessions a coach has (for pagination + roster counts). */
  async countForCoach(coachId: string): Promise<number> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("coach_id", "=", coachId)
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  /** Per-coach session count + latest session, for the admin roster. */
  async summaryByCoach(): Promise<
    Map<string, { count: number; latest: ReportSummaryRow | null }>
  > {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "session_date", "summary"])
      .orderBy("coach_id")
      .orderBy("session_date", "desc")
      .execute();
    const out = new Map<
      string,
      { count: number; latest: ReportSummaryRow | null }
    >();
    for (const r of rows) {
      const entry = out.get(r.coach_id) ?? { count: 0, latest: null };
      entry.count += 1;
      if (entry.latest === null) {
        entry.latest = {
          id: r.id,
          coachId: r.coach_id,
          date: isoDate(r.session_date),
          summary: (r.summary ?? {}) as Record<string, unknown>,
        };
      }
      out.set(r.coach_id, entry);
    }
    return out;
  }

  /**
   * One session's full content. Resolves by immutable id OR by a legacy id a
   * link was previously issued under, so older delivered links keep working.
   * Returns null when the id matches nothing — the caller reports not-found
   * rather than silently showing a different session.
   */
  async getDetail(reportId: string): Promise<ReportDetailRow | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "session_date", "summary", "metrics", "body"])
      .where((eb) =>
        eb.or([
          eb("id", "=", reportId),
          eb(sql`${reportId}`, "=", sql`ANY(legacy_ids)`),
        ]),
      )
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      coachId: row.coach_id,
      date: isoDate(row.session_date),
      summary: (row.summary ?? {}) as Record<string, unknown>,
      metrics: (row.metrics ?? {}) as Record<string, unknown>,
      body: (row.body ?? {}) as Record<string, unknown>,
    };
  }

  /** True when the id (or a legacy id) names a report owned by this coach. */
  async existsForCoach(coachId: string, reportId: string): Promise<boolean> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select("id")
      .where("coach_id", "=", coachId)
      .where((eb) =>
        eb.or([
          eb("id", "=", reportId),
          eb(sql`${reportId}`, "=", sql`ANY(legacy_ids)`),
        ]),
      )
      .executeTakeFirst();
    return Boolean(row);
  }

  /**
   * Canonicalise a possibly-legacy id to the report's current immutable id, so
   * overlay writes always store the canonical value. Null when unknown.
   */
  async canonicalId(coachId: string, reportId: string): Promise<string | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select("id")
      .where("coach_id", "=", coachId)
      .where((eb) =>
        eb.or([
          eb("id", "=", reportId),
          eb(sql`${reportId}`, "=", sql`ANY(legacy_ids)`),
        ]),
      )
      .executeTakeFirst();
    return row?.id ?? null;
  }

  /**
   * Metrics for every report of a coach (chronological), for trends. Carries
   * clusters/dimensions/bonuses plus the summary fields the series needs —
   * never the prose body.
   */
  async listMetrics(coachId: string): Promise<
    Array<{
      id: string;
      date: string;
      summary: Record<string, unknown>;
      metrics: Record<string, unknown>;
    }>
  > {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select(["id", "session_date", "summary", "metrics"])
      .where("coach_id", "=", coachId)
      .orderBy("session_date", "asc")
      .execute();
    return rows.map((r) => ({
      id: r.id,
      date: isoDate(r.session_date),
      summary: (r.summary ?? {}) as Record<string, unknown>,
      metrics: (r.metrics ?? {}) as Record<string, unknown>,
    }));
  }

  /** Metrics for every coach — the program-wide monthly rollup. */
  async listAllMetrics(): Promise<
    Array<{
      id: string;
      coachId: string;
      date: string;
      summary: Record<string, unknown>;
      metrics: Record<string, unknown>;
    }>
  > {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "session_date", "summary", "metrics"])
      .orderBy("session_date", "asc")
      .execute();
    return rows.map((r) => ({
      id: r.id,
      coachId: r.coach_id,
      date: isoDate(r.session_date),
      summary: (r.summary ?? {}) as Record<string, unknown>,
      metrics: (r.metrics ?? {}) as Record<string, unknown>,
    }));
  }

  // ─── Provenance ───────────────────────────────────────────────────────────

  async getMeta(): Promise<DatasetMetaRow | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_dataset_meta")
      .selectAll()
      .executeTakeFirst();
    if (!row) return null;
    return {
      version: String(row.version),
      reportCount: row.report_count,
      generatedAt: row.generated_at ?? null,
      schemaVersion: row.schema_version ?? null,
    };
  }

  /** Total rows in the store — the truth `report_count` must reflect. */
  async totalReports(): Promise<number> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  /**
   * Advance the provenance signal after a publish: bump `version` and set
   * `report_count` to the store's actual row count. The DB trigger rejects any
   * attempt to move `version` backwards.
   */
  async bumpMeta(generatedAt?: string | null): Promise<DatasetMetaRow> {
    const conn = this.db.getOrCreateConnection();
    const total = await this.totalReports();
    await conn
      .insertInto("coach_dataset_meta")
      .values({
        id: true,
        version: "1",
        report_count: total,
        generated_at: generatedAt ?? null,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          version: sql`coach_dataset_meta.version + 1`,
          report_count: total,
          generated_at: generatedAt ?? sql`coach_dataset_meta.generated_at`,
          updated_at: sql`NOW()`,
        }),
      )
      .execute();
    const meta = await this.getMeta();
    if (!meta) throw new Error("coach_dataset_meta missing after bump");
    return meta;
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  /**
   * Upsert one report on its natural key `(coach_id, session_date)`.
   *
   * The store is the sole assigner of ids: when a report for that leader+date
   * already exists its id is kept (so overlay rows and delivered links stay
   * valid) and the payload's id — if different — is recorded in `legacy_ids`.
   * A brand-new report takes the id the caller proposes, or a generated one.
   */
  async upsert(row: CoachReportRow): Promise<UpsertedReport> {
    const conn = this.db.getOrCreateConnection();
    const existing = await conn
      .selectFrom("coach_reports")
      .select(["id", "legacy_ids"])
      .where("coach_id", "=", row.coach_id)
      // session_date is a DATE column; cast the yyyy-mm-dd string so it matches
      .where(sql`session_date`, "=", sql`${row.session_date}::date`)
      .executeTakeFirst();

    if (existing) {
      const legacy = new Set<string>(existing.legacy_ids ?? []);
      if (row.id && row.id !== existing.id) legacy.add(row.id);
      await conn
        .updateTable("coach_reports")
        .set({
          summary: row.summary,
          metrics: row.metrics,
          body: row.body,
          legacy_ids: [...legacy],
          updated_at: sql`NOW()`,
        })
        .where("id", "=", existing.id)
        .execute();
      return {
        id: existing.id,
        coachId: row.coach_id,
        date: row.session_date,
        created: false,
      };
    }

    await conn
      .insertInto("coach_reports")
      .values({
        id: row.id,
        coach_id: row.coach_id,
        session_date: row.session_date,
        legacy_ids: row.legacy_ids ?? [],
        summary: row.summary,
        metrics: row.metrics,
        body: row.body,
      })
      .execute();
    return {
      id: row.id,
      coachId: row.coach_id,
      date: row.session_date,
      created: true,
    };
  }
}
