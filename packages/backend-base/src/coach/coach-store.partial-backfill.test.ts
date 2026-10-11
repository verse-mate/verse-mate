import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { backfillCoachStore } from "./coach-store.backfill";
import { datasetToRows } from "./coach-store.transform";
import coachDataJson from "./coach.data.json";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const service = new CoachService(Database);

type BundledCoach = { id: string; reports: Record<string, unknown>[] };
const bundled = (coachDataJson as unknown as { coaches: BundledCoach[] })
  .coaches;
const leader = bundled.find((c) => c.reports.length >= 3) as BundledCoach;
const leaderRows = datasetToRows({ coaches: [leader] });

const INTERRUPTED = "partial-backfill-leader";

async function restoreLeader() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", [leader.id, INTERRUPTED])
    .execute();
  await conn.insertInto("coach_reports").values(leaderRows).execute();
}

describe("a partly loaded legacy history is never served as complete", () => {
  beforeEach(restoreLeader);
  afterEach(restoreLeader);

  it("a leader with only their first legacy row stored still shows every bundled report", async () => {
    await conn
      .deleteFrom("coach_reports")
      .where("coach_id", "=", leader.id)
      .execute();
    await conn.insertInto("coach_reports").values(leaderRows[0]).execute();

    const reports = await service.getReportsById(leader.id);
    expect(reports?.length).toBe(leader.reports.length);
    const listed = (await service.listCoaches()).find(
      (c) => c.id === leader.id,
    );
    expect(listed?.sessionCount).toBe(leader.reports.length);
    const page = await service.getReportSummaries(leader.id);
    expect(page.total).toBe(leader.reports.length);
  });

  it("a backfill that fails part way writes nothing", async () => {
    const dataset = {
      coaches: [
        {
          id: INTERRUPTED,
          reports: [
            {
              ...leader.reports[0],
              id: `${INTERRUPTED}-1`,
              date: "2026-09-01",
            },
            {
              ...leader.reports[1],
              id: `${INTERRUPTED}-2`,
              date: "not-a-date",
            },
          ],
        },
      ],
    };
    await expect(backfillCoachStore(dataset)).rejects.toThrow();
    const written = await conn
      .selectFrom("coach_reports")
      .select("id")
      .where("coach_id", "=", INTERRUPTED)
      .execute();
    expect(written).toEqual([]);
  });
});
