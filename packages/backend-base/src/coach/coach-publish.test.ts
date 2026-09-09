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
    .where("coach_id", "in", [COACH, `${COACH}-2`])
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
    // The report row existing IS the session being live, there is no second
    // flag to forget to set.
    expect(row.state).toBe("scored");
  });

  it("re-publishing the same session updates in place, never a second report", async () => {
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

  it("DERIVES the bonuses from the head counts when the caller gives none", async () => {
    // Nothing computed them, so every report published through the pipeline
    // scored base-only: a 26-person session with five first-timers was
    // rewarded exactly as much as an empty one.
    const result = await svc.publish(
      input({ base: 76.04, attendees: 26, newcomers: 5 }),
    );
    const detail = await reader.getReportDetail(COACH, result.reportId);
    // 5 first-timers (capped at 5) + 11 heads over the threshold (capped at 3).
    expect(detail?.score).toBeCloseTo(84.04, 6);
  });

  it("caps the composite at 100, whatever the bonuses add", async () => {
    const result = await svc.publish(
      input({ base: 99, attendees: 30, newcomers: 9 }),
    );
    const detail = await reader.getReportDetail(COACH, result.reportId);
    // Every surface renders this as "x / 100".
    expect(detail?.score).toBe(100);
  });

  it("a RE-ATTRIBUTED session MOVES its report rather than making a second one", async () => {
    // An admin correcting a wrong match, or a roster edit changing which
    // keyword wins, used to leave the first report standing under the wrong
    // leader and insert a second under the right one: two reports, two emails,
    // and one session counted twice across two leaders' trends.
    const first = await svc.publish(input());
    const moved = await svc.publish(input({ coachId: "publish-coach-2" }));

    const rows = await conn
      .selectFrom("coach_reports")
      .select(["id", "coach_id"])
      .where("source_session_id", "=", "ff-pub-1")
      .execute();
    expect(rows.length).toBe(1);
    expect(rows[0].coach_id).toBe("publish-coach-2");
    // And the identity survives the move, so a link already emailed still
    // resolves.
    expect(moved.reportId).toBe(first.reportId);
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
