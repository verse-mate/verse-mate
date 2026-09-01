import type { Transaction } from "kysely";
import { sql } from "kysely";
import type Database from "../../../../database/src/models/Database";

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

/**
 * `session_date` is always selected pre-formatted in SQL (see `DATE_COL`), so it
 * never becomes a JS Date. That matters: pg parses a DATE at LOCAL midnight, so
 * `new Date('2026-08-22').toISOString()` yields 2026-08-21 on any UTC+ host —
 * every date the store served would have been a day early in Europe/Asia.
 */
function isoDate(value: unknown): string {
  if (value instanceof Date) {
    // Defensive only; the queries below avoid this path entirely.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/**
 * Clamp a pagination input to a whole number in range. `Math.min(Math.max(n, 1),
 * 100)` returns NaN for NaN, and a fractional value reaches SQL as-is, so a
 * `?limit=abc` came back as `invalid input syntax for type bigint: "NaN"` — a
 * 500 with an internal detail in it. Anything not a finite number falls back to
 * the default.
 */
function clampInt(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/** Select `session_date` as a yyyy-mm-dd string, never as a Date. */
const DATE_COL = sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as(
  "session_date",
);

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
/**
 * A write executor: the pooled connection, or an open transaction. The write
 * methods take one so a caller can make a whole batch atomic — a mid-batch
 * failure must not leave some reports committed and the provenance bump skipped.
 */
export type CoachReportsWriter = Transaction<Database>;

export class CoachReportsRepository {
  constructor(private readonly db: db) {}

  /** Run `fn` with every write inside one transaction. */
  async transaction<T>(
    fn: (writer: CoachReportsWriter) => Promise<T>,
  ): Promise<T> {
    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute((trx) => fn(trx as CoachReportsWriter));
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  /** One page of a coach's sessions, newest first. Prose is NOT loaded. */
  async listSummaries(
    coachId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<ReportSummaryRow[]> {
    const limit = clampInt(opts.limit, 25, 1, 100);
    const offset = clampInt(opts.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "summary"])
      .select(DATE_COL)
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
  async countForCoach(
    coachId: string,
    writer?: CoachReportsWriter,
  ): Promise<number> {
    const row = await (writer ?? this.db.getOrCreateConnection())
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
      .select(["id", "coach_id", "summary"])
      .select(DATE_COL)
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
   * One session's full content, for a SPECIFIC coach. Resolves by immutable id
   * OR by a legacy id a link was previously issued under, so older delivered
   * links keep working. Returns null when the id matches nothing FOR THAT COACH
   * — the caller reports not-found rather than silently showing a different
   * session, and a leader can never read another leader's report.
   */
  async getDetail(
    coachId: string,
    reportId: string,
  ): Promise<ReportDetailRow | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "summary", "metrics", "body"])
      .select(DATE_COL)
      // SECURITY: always scope to the owning coach. Report ids are predictable
      // slugs, so an unscoped lookup lets any leader read another leader's
      // private report and the admin notes attached to it.
      .where("coach_id", "=", coachId)
      .where((eb) =>
        eb.or([
          eb("id", "=", reportId),
          eb(sql`${reportId}`, "=", sql`ANY(legacy_ids)`),
        ]),
      )
      // An exact id always wins over another report's legacy alias, so the
      // result cannot flip with the query plan.
      .orderBy(sql`case when id = ${reportId} then 0 else 1 end`)
      .limit(1)
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
      .select(["id", "summary", "metrics"])
      .select(DATE_COL)
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

  /**
   * Every report of a coach, complete, in ONE query. Replaces a
   * listMetrics-then-getDetail-per-row loop that fired N+1 queries and, via
   * Promise.all, queued N connection acquisitions against a 10-connection pool
   * — one leader's dashboard could monopolise the whole pool.
   */
  async listFullReports(coachId: string): Promise<ReportDetailRow[]> {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "summary", "metrics", "body"])
      .select(DATE_COL)
      .where("coach_id", "=", coachId)
      .orderBy("session_date", "desc")
      .execute();
    return rows.map((r) => ({
      id: r.id,
      coachId: r.coach_id,
      date: isoDate(r.session_date),
      summary: (r.summary ?? {}) as Record<string, unknown>,
      metrics: (r.metrics ?? {}) as Record<string, unknown>,
      body: (r.body ?? {}) as Record<string, unknown>,
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
      .select(["id", "coach_id", "summary", "metrics"])
      .select(DATE_COL)
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

  async getMeta(writer?: CoachReportsWriter): Promise<DatasetMetaRow | null> {
    const row = await (writer ?? this.db.getOrCreateConnection())
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
  async totalReports(writer?: CoachReportsWriter): Promise<number> {
    const row = await (writer ?? this.db.getOrCreateConnection())
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
  async bumpMeta(
    generatedAt?: string | null,
    writer?: CoachReportsWriter,
  ): Promise<DatasetMetaRow> {
    const conn = writer ?? this.db.getOrCreateConnection();
    const total = await this.totalReports(writer);
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
    const meta = await this.getMeta(writer);
    if (!meta) throw new Error("coach_dataset_meta missing after bump");
    return meta;
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  /**
   * Upsert one report on its natural key
   * `(coach_id, session_date, source_session_id)`.
   *
   * The store is the sole assigner of ids: when a report for that leader, date
   * AND source session already exists its id is kept (so overlay rows and
   * delivered links stay valid) and the payload's id — if different — is
   * recorded in `legacy_ids`. A brand-new report takes the id the caller
   * proposes, or a generated one.
   *
   * The source session is in the key because a leader may teach twice on one
   * date: those are two reports, not a collision. On `(coach_id, session_date)`
   * alone the second was a hard unique violation.
   */
  async upsert(
    row: CoachReportRow,
    writer?: CoachReportsWriter,
  ): Promise<UpsertedReport> {
    // ONE atomic statement: a SELECT-then-INSERT races two concurrent publishes
    // for the same leader+date into a unique-constraint 500. ON CONFLICT also
    // preserves the report's identity — the incoming id is appended to
    // legacy_ids instead of replacing it, so delivered links keep resolving.
    const result = await sql<{ id: string; created: boolean }>`
      INSERT INTO coach_reports
        (id, coach_id, session_date, source_session_id,
         legacy_ids, summary, metrics, body)
      VALUES (
        ${row.id}, ${row.coach_id}, ${row.session_date}::date,
        ${row.source_session_id},
        ${sql.val(row.legacy_ids ?? [])}::text[],
        ${JSON.stringify(row.summary)}::jsonb,
        ${JSON.stringify(row.metrics)}::jsonb,
        ${JSON.stringify(row.body)}::jsonb
      )
      ON CONFLICT (coach_id, session_date, source_session_id) DO UPDATE SET
        summary = EXCLUDED.summary,
        metrics = EXCLUDED.metrics,
        body    = EXCLUDED.body,
        legacy_ids = CASE
          WHEN EXCLUDED.id = coach_reports.id THEN coach_reports.legacy_ids
          WHEN EXCLUDED.id = ANY(coach_reports.legacy_ids) THEN coach_reports.legacy_ids
          ELSE array_append(coach_reports.legacy_ids, EXCLUDED.id)
        END,
        updated_at = NOW()
      RETURNING id, (xmax = 0) AS created
    `.execute(writer ?? this.db.getOrCreateConnection());

    const first = result.rows[0];
    return {
      id: first.id,
      coachId: row.coach_id,
      date: row.session_date,
      created: Boolean(first.created),
    };
  }
}
