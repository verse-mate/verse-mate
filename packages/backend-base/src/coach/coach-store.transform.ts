/**
 * Pure transform from the bundled `coach.data.json` shape into `coach_reports`
 * rows (change: coach-reports-store). Kept side-effect-free so the field-housing
 * contract is unit-testable without a database.
 *
 * Every field of a dataset report is housed, id → the row's immutable id
 * (the existing slug, so overlay joins survive), date → session_date,
 * everything else split across summary / metrics / body. `recordingUrl` and
 * `notes` are NOT dataset-report fields (they are overlay-joined at read time),
 * so they are intentionally absent here.
 */

export interface CoachReportRow {
  id: string;
  coach_id: string;
  session_date: string;
  /** The provider's session identifier; part of the row's natural key. */
  source_session_id: string;
  legacy_ids: string[];
  summary: Record<string, unknown>;
  metrics: Record<string, unknown>;
  body: Record<string, unknown>;
}

/** Pick a subset of keys that are present on the source object. */
function pick(
  src: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in src) out[k] = src[k];
  }
  return out;
}

const SUMMARY_KEYS = [
  "dateLabel",
  "session",
  "topic",
  "duration",
  "attendees",
  "newcomers",
  "score",
  "status",
  "statusEmoji",
  "pdfUrl",
  "docUrl",
];
const METRICS_KEYS = [
  "base",
  "newcomerBonus",
  "sizeBonus",
  "clusters",
  "dimensions",
];
const BODY_KEYS = ["bigIdeas", "feedback", "sections"];

/**
 * The `source_session_id` a backfilled report takes. Deterministic, so a second
 * backfill run matches the row the first one wrote rather than inserting beside
 * it, the whole reason the column is NOT NULL.
 *
 * `ordinal` separates two sessions the same leader ran on the same day. The
 * unique key is (coach_id, session_date, source_session_id), so without it the
 * second such report would have upserted OVER the first and one session's
 * report would have disappeared with nothing raised. Today's bundle has no such
 * pair, but a leader running a Saturday morning and a make-up class on one date
 * is an ordinary week, not an exotic case. The first report on a date keeps the
 * unsuffixed id, so every row the current backfill wrote still matches.
 */
export function legacySourceSessionId(
  coachId: string,
  date: string,
  ordinal = 0,
): string {
  const base = `legacy:${coachId}:${date}`;
  return ordinal === 0 ? base : `${base}#${ordinal}`;
}

/** One dataset report (under coach `coachId`) → one coach_reports row. */
export function reportToRow(
  coachId: string,
  report: Record<string, unknown>,
  ordinal = 0,
): CoachReportRow {
  return {
    id: String(report.id),
    coach_id: coachId,
    session_date: String(report.date),
    // Backfilled reports predate intake and have no source session. The
    // sentinel is title-free by construction: deriving it from the legacy id
    // would embed the session title (those ids are slugs like
    // `bryan-bailey-2026-08-22-saturday-morning-group-austin-ri`), which report
    // identity forbids and which stops the backfill being idempotent across a
    // re-title.
    source_session_id: legacySourceSessionId(
      coachId,
      String(report.date),
      ordinal,
    ),
    legacy_ids: [],
    summary: pick(report, SUMMARY_KEYS),
    metrics: pick(report, METRICS_KEYS),
    body: pick(report, BODY_KEYS),
  };
}

export interface CoachDatasetMeta {
  report_count: number;
  generated_at: string | null;
  schema_version: number | null;
}

/** All rows for the whole deployed dataset, in file order. */
export function datasetToRows(dataset: unknown): CoachReportRow[] {
  const coaches =
    (dataset as { coaches?: Array<Record<string, unknown>> }).coaches ?? [];
  const rows: CoachReportRow[] = [];
  for (const coach of coaches) {
    const reports = (coach.reports as Array<Record<string, unknown>>) ?? [];
    // Counted per leader per date, in file order, so a second session on one
    // day gets its own sentinel instead of overwriting the first.
    const seenOnDate = new Map<string, number>();
    for (const report of reports) {
      const key = String(report.date);
      const ordinal = seenOnDate.get(key) ?? 0;
      seenOnDate.set(key, ordinal + 1);
      rows.push(reportToRow(String(coach.id), report, ordinal));
    }
  }
  return rows;
}

/** Provenance for coach_dataset_meta, derived from the dataset itself. */
export function datasetMeta(dataset: unknown): CoachDatasetMeta {
  const d = dataset as {
    schemaVersion?: number;
    generatedAt?: string;
    coaches?: Array<{ reports?: unknown[] }>;
  };
  const report_count = (d.coaches ?? []).reduce(
    (n, c) => n + (c.reports?.length ?? 0),
    0,
  );
  return {
    report_count,
    generated_at: d.generatedAt ?? null,
    schema_version:
      typeof d.schemaVersion === "number" ? d.schemaVersion : null,
  };
}

/**
 * Inverse of `reportToRow`: reassemble the report contract the API serves from
 * the stored jsonb columns. Round-trips exactly (see the transform test), so
 * moving reads onto the store cannot silently drop a field.
 */
export function rowToReport(row: {
  id: string;
  /** yyyy-mm-dd. Accepts either the DB column name or the API field name. */
  session_date?: string;
  date?: string;
  summary: Record<string, unknown>;
  metrics: Record<string, unknown>;
  body: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: row.id,
    date: row.session_date ?? row.date ?? "",
    ...row.summary,
    ...row.metrics,
    ...row.body,
  };
}

/**
 * The list-view projection: identity + summary only, never prose. This is what
 * a paginated session list returns, so a long history stays bounded.
 */
export function rowToSummary(row: {
  id: string;
  session_date?: string;
  date?: string;
  summary: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: row.id,
    date: row.session_date ?? row.date ?? "",
    ...row.summary,
  };
}
