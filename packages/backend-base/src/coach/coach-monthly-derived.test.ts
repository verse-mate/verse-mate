import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { Value } from "@sinclair/typebox/value";

import { reportToRow } from "./coach-store.transform";
import coachData from "./coach.data.json";
import { LeaderMonthlyResponseSchema } from "./coach.schema";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const service = new CoachService(Database);
const SLUG = "pipeline-only-leader";
const EMAIL = "pipeline-only-leader@example.test";

type Report = Record<string, unknown> & {
  feedback: { strengths: string[]; improvements: string[] };
  dimensions: { n: number; name: string; score: number | null }[];
  clusters: { name: string; scorePct: number | null }[];
};
const template = (coachData as unknown as { coaches: { reports: Report[] }[] })
  .coaches[0].reports[0];

const sessions = [
  { date: "2031-02-20", score: 70 },
  { date: "2031-03-06", score: 60 },
  { date: "2031-03-13", score: 80 },
  { date: "2031-03-20", score: 91 },
];

async function clear() {
  await conn.deleteFrom("coach_reports").where("coach_id", "=", SLUG).execute();
  await conn
    .deleteFrom("coach_monthly_leader_summaries")
    .where("coach_id", "=", SLUG)
    .execute();
  await conn.deleteFrom("coach_leaders").where("email", "=", EMAIL).execute();
  await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
}

describe("a leader whose sessions came through the pipeline gets a monthly summary", () => {
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: SLUG, email: EMAIL, name: "Pipeline Only" })
      .execute();
    for (const s of sessions) {
      await conn
        .insertInto("coach_reports")
        .values({
          ...reportToRow(SLUG, {
            ...template,
            id: `${SLUG}-${s.date}`,
            date: s.date,
            session: `Session ${s.date}`,
            score: s.score,
          }),
          source_session_id: `ff-${SLUG}-${s.date}`,
        })
        .execute();
    }
  });
  afterEach(clear);

  it("derives the month's summary from its evaluated sessions", async () => {
    const res = await service.getMonthlySummaryById(SLUG, "2031-03");
    const summary = res?.summary;
    expect(summary).not.toBeNull();
    expect(summary?.month).toBe("2031-03");
    expect(summary?.monthLabel).toBe("March 2031");
    expect(summary?.priorMonthLabel).toBe("February 2031");
    expect(summary?.leaderId).toBe(SLUG);
    expect(summary?.sessionsCount).toBe(3);
    expect(summary?.composite).toBe(77);
    expect(summary?.status.label).toBe("Strong");
    expect(summary?.priorComposite).toBe(70);
    expect(summary?.delta).toBe(7);
    expect(summary?.glance.rows.map((r) => r.date)).toEqual([
      "2031-03-06",
      "2031-03-13",
      "2031-03-20",
    ]);
    expect(summary?.trajectory.map((t) => t.delta)).toEqual([null, 20, 11]);

    const tc = template.clusters.find((c) => c.name === "Teaching Craft");
    expect(summary?.clusterAvg.tc).toBe(Math.round(tc?.scorePct as number));
    expect(summary?.clusters.map((c) => c.key)).toEqual([
      "tc",
      "bm",
      "ep",
      "br",
    ]);

    expect(summary?.strengths).toContainEqual({
      text: template.feedback.strengths[0],
      session: "2031-03-06",
    });
    expect(summary?.growth).toContainEqual({
      text: template.feedback.improvements[0],
      session: "2031-03-20",
    });
    expect(summary?.sessions).toHaveLength(3);
    expect(summary?.sessions[0].dimensions[0]).toMatchObject({
      n: template.dimensions[0].n,
      score: template.dimensions[0].score,
      cluster: "Teaching Craft",
    });

    expect(summary?.trends).toEqual([]);
    expect(summary?.conversationGuide).toEqual([]);
    expect(summary?.focus.goals).toEqual([]);
    expect(res?.availableMonths).toEqual(["2031-03", "2031-02"]);
    expect(Value.Check(LeaderMonthlyResponseSchema, res)).toBe(true);
  });

  it("the leader reads the same summary on their own trends screen", async () => {
    const user = await conn
      .insertInto("user")
      .values({
        email: EMAIL,
        firstName: "Pipeline",
        lastName: "Only",
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const mine = await service.getMyMonthlySummary(user.id, "2031-03");
    expect(mine?.summary?.sessionsCount).toBe(3);
    expect(mine?.availableMonths).toContain("2031-03");
  });

  it("an imported summary still wins for its month", async () => {
    const imported = { month: "2031-03", sessionsCount: 9, trends: ["old"] };
    await conn
      .insertInto("coach_monthly_leader_summaries")
      .values({ coach_id: SLUG, month: "2031-03", summary: imported })
      .execute();
    const res = await service.getMonthlySummaryById(SLUG, "2031-03");
    expect(res?.summary).toMatchObject(imported);
  });

  it("a month with no evaluated session has no summary", async () => {
    const res = await service.getMonthlySummaryById(SLUG, "2031-04");
    expect(res?.summary).toBeNull();
  });
});
