/**
 * Pure transform from the bundled `coach.data.json` shape into `coach_reports`
 * rows (change: coach-reports-store). Kept side-effect-free so the field-housing
 * contract is unit-testable without a database.
 *
 * Every field of a dataset report is housed — id → the row's immutable id
 * (the existing slug, so overlay joins survive), date → session_date,
 * everything else split across summary / metrics / body. `recordingUrl` and
 * `notes` are NOT dataset-report fields (they are overlay-joined at read time),
 * so they are intentionally absent here.
 */

export interface CoachReportRow {
  id: string;
  coach_id: string;
  session_date: string;
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

/** One dataset report (under coach `coachId`) → one coach_reports row. */
export function reportToRow(
  coachId: string,
  report: Record<string, unknown>,
): CoachReportRow {
  return {
    id: String(report.id),
    coach_id: coachId,
    session_date: String(report.date),
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
    for (const report of reports) {
      rows.push(reportToRow(String(coach.id), report));
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
