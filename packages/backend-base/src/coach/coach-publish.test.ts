import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachPublishService } from "./coach-publish.service";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const COACH = "publish-coach";
const svc = new CoachPublishService(Database);
const reader = new CoachService(Database);

function input(over: Record<string, unknown> = {}) {
  return {
    sourceSessionId: "ff-pub-1",
    coachId: COACH,
    sessionDate: "2026-08-22",
    sessionTitle: "Obadiah, Lesson 4",
    base: 78.1,
    clusters: [
      { name: "Teaching Craft", weight: 33, scorePct: 68, contribution: 22.44 },
    ],
    dimensions: [
      { n: 1, name: "Session Structure & Flow", score: 4, note: "ok" },
    ],
    bigIdeas: ["pride goes before a fall"],
    feedback: {
      headline: "solid",
      strengths: [],
      improvements: [],
      recommendations: [],
    },
    attendees: 12,
    newcomers: 1,
    duration: "62 min",
    ...over,
  };
}

async function seedSession(id = "ff-pub-1") {
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: id,
      coach_id: COACH,
      title: "Obadiah",
      session_date: "2026-08-22",
      state: "retained",
    })
    .execute();
}

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("coach_id", "=", COACH)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

describe("scoring a session is what makes it live", () => {
  beforeEach(async () => {
    await clear();
    await seedSession();
  });
  afterEach(clear);

  it("a reader can see the session immediately after it is published", async () => {
    // No deploy, no separate human step. On the retired host, publishing meant
    // pushing a JSON file and waiting for a deploy, so content cadence was
    // chained to deploy cadence.
    const result = await svc.publish(input());
    expect(result.created).toBe(true);

    const detail = await reader.getReportDetail(COACH, result.reportId);
    expect(detail?.id).toBe(result.reportId);
    expect(detail?.session).toBe("Obadiah, Lesson 4");
  });

  it("the session is linked to the report it produced", async () => {
    const result = await svc.publish(input());
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["report_id", "state"])
      .where("source_session_id", "=", "ff-pub-1")
      .executeTakeFirstOrThrow();
    expect(row.report_id).toBe(result.reportId);
    // The report row existing IS the session being live — there is no second
    // flag to forget to set.
    expect(row.state).toBe("scored");
  });

  it("re-publishing the same session updates in place — never a second report", async () => {
    const first = await svc.publish(input());
    const second = await svc.publish(input({ base: 80 }));

    expect(second.reportId).toBe(first.reportId);
    expect(second.created).toBe(false);
    const rows = await conn
      .selectFrom("coach_reports")
      .select("id")
      .where("coach_id", "=", COACH)
      .execute();
    expect(rows.length).toBe(1);
  });

  it("nothing new to publish is reported as unchanged, not as a write", async () => {
    await svc.publish(input());
    const again = await svc.publish(input());
    expect(again.unchanged).toBe(true);
  });

  it("a changed score is NOT unchanged", async () => {
    await svc.publish(input());
    const again = await svc.publish(input({ base: 90 }));
    expect(again.unchanged).toBe(false);
  });

  it("the composite carries the bonuses, and the band follows it", async () => {
    const result = await svc.publish(
      input({ base: 78.1, newcomerBonus: 5, sizeBonus: 2 }),
    );
    const detail = await reader.getReportDetail(COACH, result.reportId);
    expect(detail?.score).toBeCloseTo(85.1, 6);
    // 85.1 lands in the top band.
    expect(detail?.status).toBe("Exceptional");
  });

  it("publishing advances the provenance version, so a stale view is detectable", async () => {
    await svc.publish(input());
    const first = await conn
      .selectFrom("coach_dataset_meta")
      .select("version")
      .executeTakeFirstOrThrow();
    await svc.publish(input({ base: 80 }));
    const second = await conn
      .selectFrom("coach_dataset_meta")
      .select("version")
      .executeTakeFirstOrThrow();
    expect(Number(second.version)).toBeGreaterThan(Number(first.version));
  });

  it("two sessions for one leader on one date publish as two reports", async () => {
    await seedSession("ff-pub-2");
    const a = await svc.publish(input());
    const b = await svc.publish(
      input({ sourceSessionId: "ff-pub-2", sessionTitle: "Evening group" }),
    );
    expect(a.reportId).not.toBe(b.reportId);
    const rows = await conn
      .selectFrom("coach_reports")
      .select("id")
      .where("coach_id", "=", COACH)
      .execute();
    expect(rows.length).toBe(2);
  });
});
