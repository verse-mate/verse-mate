import { describe, expect, it } from "bun:test";

import { datasetToRows, reportToRow } from "./coach-store.transform";
import coachDataJson from "./coach.data.json";

// The deployed dataset is the authoritative backfill source (never the exporter).
const coaches = (coachDataJson as { coaches: any[] }).coaches;
const deployedCount = coaches.reduce((n, c) => n + c.reports.length, 0);

describe("coach-store transform", () => {
  it("produces exactly one row per deployed report (count is read, not hardcoded)", () => {
    const rows = datasetToRows(coachDataJson);
    expect(rows.length).toBe(deployedCount);
  });

  it("uses the existing slug as the immutable id and the coach slug as coach_id", () => {
    const coach = coaches[0];
    const report = coach.reports[0];
    const row = reportToRow(coach.id, report);
    expect(row.id).toBe(report.id); // backfilled id == deployed slug → overlay joins survive
    expect(row.coach_id).toBe(coach.id);
    expect(row.session_date).toBe(report.date);
    expect(row.legacy_ids).toEqual([]);
  });

  it("houses every dataset report field across summary/metrics/body (none dropped)", () => {
    const coach = coaches[0];
    const report = coach.reports[0];
    const row = reportToRow(coach.id, report);
    // fields the row splits out of the report object (id→pk, date→session_date, coach→coach_id)
    const housed = new Set<string>([
      "id",
      "date",
      ...Object.keys(row.summary),
      ...Object.keys(row.metrics),
      ...Object.keys(row.body),
    ]);
    for (const field of Object.keys(report)) {
      expect(housed.has(field)).toBe(true);
    }
    // list card needs these in summary (not buried in body)
    expect(row.summary).toHaveProperty("pdfUrl");
    expect(row.summary).toHaveProperty("topic");
  });

  it("carries meta: report_count matches the deployed corpus", () => {
    const rows = datasetToRows(coachDataJson);
    const meta = (coachDataJson as any).schemaVersion;
    expect(rows.length).toBe(deployedCount);
    expect(typeof meta).toBe("number");
  });
});
