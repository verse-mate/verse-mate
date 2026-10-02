import { describe, expect, it } from "bun:test";

import {
  datasetToRows,
  reportToRow,
  rowToReport,
  rowToSummary,
} from "./coach-store.transform";
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
  it("round-trips: a deployed report survives reportToRow -> rowToReport intact", () => {
    const coach = coaches[0];
    for (const report of coach.reports.slice(0, 3)) {
      const row = reportToRow(coach.id, report);
      const back = rowToReport(row);
      // every field of the original report comes back with the same value
      for (const [key, value] of Object.entries(report)) {
        expect(JSON.stringify(back[key])).toBe(JSON.stringify(value));
      }
    }
  });

  it("list projection carries the card fields and NO prose", () => {
    const coach = coaches[0];
    const row = reportToRow(coach.id, coach.reports[0]);
    const summary = rowToSummary(row);
    expect(summary).toHaveProperty("id");
    expect(summary).toHaveProperty("pdfUrl");
    expect(summary).toHaveProperty("topic");
    expect(summary).toHaveProperty("score");
    // prose stays out of the list
    expect(summary).not.toHaveProperty("feedback");
    expect(summary).not.toHaveProperty("sections");
    expect(summary).not.toHaveProperty("bigIdeas");
  });
});

describe("two sessions on one day are two reports", () => {
  it("gives the SECOND same-day report its own source session id", () => {
    // The unique key is (coach_id, session_date, source_session_id). With one
    // sentinel per (leader, date) the second report upserted over the first,
    // and one session's report disappeared with nothing raised.
    const rows = datasetToRows({
      coaches: [
        {
          id: "bryan-bailey",
          reports: [
            { id: "morning", date: "2026-08-22" },
            { id: "makeup", date: "2026-08-22" },
            { id: "next-week", date: "2026-08-29" },
          ],
        },
      ],
    });
    const ids = rows.map((r) => r.source_session_id);
    expect(new Set(ids).size).toBe(3);
    // The first report on a date keeps the unsuffixed id, so every row the
    // current backfill already wrote still matches.
    expect(ids[0]).toBe("legacy:bryan-bailey:2026-08-22");
    expect(ids[1]).toBe("legacy:bryan-bailey:2026-08-22#1");
    expect(ids[2]).toBe("legacy:bryan-bailey:2026-08-29");
  });

  it("the sentinel is still TITLE-FREE, so a re-title stays idempotent", () => {
    const before = datasetToRows({
      coaches: [
        {
          id: "c",
          reports: [{ id: "saturday-morning-group", date: "2026-08-22" }],
        },
      ],
    });
    const after = datasetToRows({
      coaches: [
        { id: "c", reports: [{ id: "renamed-entirely", date: "2026-08-22" }] },
      ],
    });
    expect(before[0].source_session_id).toBe(after[0].source_session_id);
  });

  it("the BUNDLED corpus is unchanged by the ordinal", () => {
    // Measured: no leader in today's bundle has two reports on one date, so
    // every sentinel is still the unsuffixed form the first backfill wrote.
    const rows = datasetToRows(coachDataJson);
    expect(rows.filter((r) => r.source_session_id.includes("#"))).toEqual([]);
    expect(new Set(rows.map((r) => r.source_session_id)).size).toBe(
      rows.length,
    );
  });
});
