import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { type CoachDataset, CoachService } from "./coach.service";
import { CLUSTERS, RUBRIC_MODEL_VERSION, STATUS_BANDS } from "./rubric";

const conn = Database.getOrCreateConnection();
const SLUG = "post-bundle-reader";
const EMAIL = "post-bundle-reader@example.test";
const MONTH = "2031-01";

const noBundle = new CoachService(Database, undefined, {
  coaches: [],
} as unknown as CoachDataset);

const importedSummary = {
  month: MONTH,
  monthLabel: "January 2031",
  leaderId: SLUG,
  sessionsCount: 4,
  composite: 77.5,
  trends: ["Imported prose the old system wrote."],
};
const narrative = {
  executiveSummary: ["The program grew."],
  trends: ["Attendance rose."],
};

async function clear() {
  await conn
    .deleteFrom("coach_monthly_leader_summaries")
    .where("coach_id", "=", SLUG)
    .execute();
  await conn
    .deleteFrom("coach_monthly_narratives")
    .where("month", "=", MONTH)
    .execute();
  await conn.deleteFrom("coach_leaders").where("email", "=", EMAIL).execute();
  await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
}

describe("with the bundle deleted, the coach reads come from the database", () => {
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: SLUG, email: EMAIL, name: "Post Bundle Reader" })
      .execute();
    await conn
      .insertInto("coach_monthly_leader_summaries")
      .values({ coach_id: SLUG, month: MONTH, summary: importedSummary })
      .execute();
    await conn
      .insertInto("coach_monthly_narratives")
      .values({
        month: MONTH,
        executive_summary: JSON.stringify(narrative.executiveSummary),
        trends: JSON.stringify(narrative.trends),
      })
      .execute();
  });
  afterEach(clear);

  it("an imported monthly summary is read from coach_monthly_leader_summaries", async () => {
    const res = await noBundle.getMonthlySummaryById(SLUG, MONTH);
    expect(res?.summary).toMatchObject(importedSummary);
    expect(res?.availableMonths).toContain(MONTH);
  });

  it("the program-wide narrative is read from coach_monthly_narratives", async () => {
    const monthly = await noBundle.getMonthly(MONTH);
    expect(monthly.narrative).toEqual(narrative);
    expect(monthly.program.clusters.map((c) => c.name)).toEqual(
      CLUSTERS.map((c) => c.name),
    );
  });

  it("the rubric a leader is served comes from the code, not the bundle", async () => {
    const user = await conn
      .insertInto("user")
      .values({
        email: EMAIL,
        firstName: "Post",
        lastName: "Bundle",
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const me = await noBundle.getMe(user.id);
    expect(me?.model).toBe(RUBRIC_MODEL_VERSION);
    expect(me?.clusters).toEqual([...CLUSTERS]);
    expect(me?.statusBands).toEqual([...STATUS_BANDS]);
  });
});
