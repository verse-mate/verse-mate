import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { db as Database } from "database";

import { calibrationShortfalls } from "./coach-calibration";
import coachDataJson from "./coach.data.json";
import { type CoachDataset, CoachService } from "./coach.service";
import { DIMENSIONS } from "./rubric";

const conn = Database.getOrCreateConnection();
const COACH = "guard-merge-coach";

function bundledReport(id: string, date: string) {
  return {
    id,
    date,
    dateLabel: date,
    session: `bundled ${date}`,
    topic: "t",
    duration: "60 min",
    attendees: 5,
    newcomers: 0,
    score: 70,
    base: 70,
    newcomerBonus: 0,
    sizeBonus: 0,
    status: "Strong",
    statusEmoji: "",
    clusters: [],
    dimensions: [],
    bigIdeas: [],
    feedback: {
      headline: "",
      strengths: [],
      improvements: [],
      recommendations: [],
    },
  };
}

function bundleWith(reports: ReturnType<typeof bundledReport>[]): CoachDataset {
  return {
    ...(coachDataJson as unknown as CoachDataset),
    coaches: [
      {
        id: COACH,
        name: "Guard Merge",
        email: "guard-merge@example.test",
        group: "g",
        coachName: "c",
        isCoach: true,
        zoomLink: "",
        reports,
      },
    ],
  } as unknown as CoachDataset;
}

async function stored(id: string, date: string, source: string) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: COACH,
      session_date: date,
      source_session_id: source,
      legacy_ids: [],
      summary: JSON.stringify({
        dateLabel: date,
        session: `stored ${date}`,
        score: 70,
        status: "Strong",
      }),
      metrics: JSON.stringify({ clusters: [], dimensions: [] }),
      body: {},
    })
    .execute();
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

describe("a leader part-way through the backfill sees their sessions newest first", () => {
  beforeEach(async () => {
    await clear();
    await stored("guard-june", "2026-06-01", `legacy:${COACH}:2026-06-01`);
    await stored("guard-august", "2026-08-01", "ff-guard-august");
  });
  afterEach(clear);

  const bundle = bundleWith([
    bundledReport("guard-june", "2026-06-01"),
    bundledReport("guard-september", "2026-09-15"),
  ]);

  it("the merged session list is ordered by date", async () => {
    const page = await new CoachService(
      Database,
      undefined,
      bundle,
    ).getReportSummaries(COACH);
    expect(page.items.map((r) => r.date)).toEqual([
      "2026-09-15",
      "2026-08-01",
      "2026-06-01",
    ]);
  });

  it("the roster shows the newest session as the latest", async () => {
    const coaches = await new CoachService(
      Database,
      undefined,
      bundle,
    ).listCoaches();
    expect(coaches.find((c) => c.id === COACH)?.latest?.date).toBe(
      "2026-09-15",
    );
  });

  it("the admin drill-in lists the merged sessions newest first", async () => {
    const reports = await new CoachService(
      Database,
      undefined,
      bundle,
    ).getReportsById(COACH);
    expect(reports?.map((r) => r.date)).toEqual([
      "2026-09-15",
      "2026-08-01",
      "2026-06-01",
    ]);
  });
});

describe("a fully backfilled leader's session list is paginated in the database", () => {
  beforeEach(async () => {
    await clear();
    await stored("guard-june", "2026-06-01", `legacy:${COACH}:2026-06-01`);
    await stored("guard-july", "2026-07-01", `legacy:${COACH}:2026-07-01`);
    await stored("guard-august", "2026-08-01", "ff-guard-august");
  });
  afterEach(clear);

  it("one page loads one page, not the whole corpus", async () => {
    const service = new CoachService(
      Database,
      undefined,
      bundleWith([
        bundledReport("guard-june", "2026-06-01"),
        bundledReport("guard-july", "2026-07-01"),
      ]),
    );
    const repo = (service as unknown as { reportsRepository: object })
      .reportsRepository as {
      listFullReports: (...a: unknown[]) => unknown;
      listSummaries: (...a: unknown[]) => unknown;
    };
    const full = spyOn(repo, "listFullReports");
    const paged = spyOn(repo, "listSummaries");

    const page = await service.getReportSummaries(COACH, { limit: 1 });

    expect(page.total).toBe(3);
    expect(page.items.map((r) => r.date)).toEqual(["2026-08-01"]);
    expect(full).not.toHaveBeenCalled();
    expect(paged).toHaveBeenCalledTimes(1);
  });
});

describe("calibration gates every model-produced report", () => {
  const REPORT = "guard-calibration-report";
  afterEach(async () => {
    await conn.deleteFrom("coach_reports").where("id", "=", REPORT).execute();
  });

  async function scoredBy(provenance: (n: number) => "machine" | "human") {
    await stored(REPORT, "2026-09-01", `ff-${REPORT}`);
    for (const d of DIMENSIONS) {
      await conn
        .insertInto("coach_report_dimension_scores")
        .values({
          report_id: REPORT,
          dimension_n: d.n,
          score: 3,
          rationale: "r",
          provenance: provenance(d.n),
          model_version: "guard-uncalibrated-version",
        })
        .execute();
    }
  }

  it("a model-produced report an admin corrected on every dimension is still held for calibration", async () => {
    await scoredBy(() => "human");
    expect(await calibrationShortfalls(Database, REPORT)).toEqual([
      "no calibration is recorded for guard-uncalibrated-version",
    ]);
  });

  it("one machine dimension left is enough to need calibration", async () => {
    await scoredBy((n) => (n === 1 ? "machine" : "human"));
    expect(await calibrationShortfalls(Database, REPORT)).toEqual([
      "no calibration is recorded for guard-uncalibrated-version",
    ]);
  });
});
