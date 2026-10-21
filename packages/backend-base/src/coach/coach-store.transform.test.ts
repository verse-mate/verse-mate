import { describe, expect, it } from "bun:test";

import { FIXTURE_LEADERS, fixtureReport } from "./coach-fixture";
import {
  reportToRow,
  rowToReport,
  rowToSummary,
} from "./coach-store.transform";

const COACH = FIXTURE_LEADERS[0].slug;
const report = fixtureReport("fixture-transform", "2033-04-05", 72.5) as never;

describe("coach-store transform", () => {
  it("uses the report id as the immutable id and the coach slug as coach_id", () => {
    const row = reportToRow(COACH, report);
    expect(row.id).toBe("fixture-transform");
    expect(row.coach_id).toBe(COACH);
    expect(row.session_date).toBe("2033-04-05");
    expect(row.legacy_ids).toEqual([]);
  });

  it("houses every report field across summary/metrics/body (none dropped)", () => {
    const row = reportToRow(COACH, report);
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
    expect(row.summary).toHaveProperty("pdfUrl");
    expect(row.summary).toHaveProperty("topic");
  });

  it("round-trips: a report survives reportToRow -> rowToReport intact", () => {
    const back = rowToReport(reportToRow(COACH, report));
    for (const [key, value] of Object.entries(report as object)) {
      expect(JSON.stringify(back[key])).toBe(JSON.stringify(value));
    }
  });

  it("list projection carries the card fields and NO prose", () => {
    const summary = rowToSummary(reportToRow(COACH, report));
    expect(summary).toHaveProperty("id");
    expect(summary).toHaveProperty("pdfUrl");
    expect(summary).toHaveProperty("topic");
    expect(summary).toHaveProperty("score");
    expect(summary).not.toHaveProperty("feedback");
    expect(summary).not.toHaveProperty("sections");
    expect(summary).not.toHaveProperty("bigIdeas");
  });
});

describe("two sessions on one day are two reports", () => {
  it("gives the SECOND same-day report its own source session id", () => {
    const ids = [
      reportToRow("avery-hollis", { id: "morning", date: "2026-08-22" }, 0),
      reportToRow("avery-hollis", { id: "makeup", date: "2026-08-22" }, 1),
      reportToRow("avery-hollis", { id: "next-week", date: "2026-08-29" }, 0),
    ].map((r) => r.source_session_id);
    expect(ids).toEqual([
      "legacy:avery-hollis:2026-08-22",
      "legacy:avery-hollis:2026-08-22#1",
      "legacy:avery-hollis:2026-08-29",
    ]);
  });

  it("the sentinel is TITLE-FREE, so a re-title stays idempotent", () => {
    const before = reportToRow("c", {
      id: "saturday-morning-group",
      date: "2026-08-22",
    });
    const after = reportToRow("c", {
      id: "renamed-entirely",
      date: "2026-08-22",
    });
    expect(before.source_session_id).toBe(after.source_session_id);
  });
});

describe("A backfilled report's legacy monologue-details row is not shown", () => {
  const isDetails = (b: unknown) =>
    typeof b === "string" && b.startsWith("Monologue details");

  it("the stored report drops the row and keeps the monologue count", () => {
    const withDetails = fixtureReport("fixture-mono", "2033-04-12", 70, {
      sections: [
        {
          title: "Leadership",
          bullets: [
            "Monologue count: 2",
            "Monologue details: 03:10 for 2 min, 41:00 for 3 min",
            "Vulnerability moments: 1",
          ],
        },
      ],
    });
    const shown = rowToReport(reportToRow(COACH, withDetails as never));
    const bullets = (shown.sections as { bullets: string[] }[])[0].bullets;
    expect(bullets.some(isDetails)).toBe(false);
    expect(bullets).toEqual(["Monologue count: 2", "Vulnerability moments: 1"]);
  });
});
