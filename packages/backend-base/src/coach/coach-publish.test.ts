import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

import {
  AttributionChangedError,
  CoachPublishService,
} from "./coach-publish.service";
import { isolateTable } from "./coach-test-tables";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
isolateTable("coach_dataset_meta");
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
    holdReason: null,
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
    .where("coach_id", "in", [COACH, `${COACH}-2`])
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", [COACH, `${COACH}-2`])
    .execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

describe("publishing a scored session", () => {
  beforeEach(async () => {
    await clear();
    await seedSession();
  });
  afterEach(clear);

  it("a published report is held: an admin reads it at once, a leader only after delivery", async () => {
    const result = await svc.publish(input());
    expect(result.created).toBe(true);

    const detail = await reader.getReportDetail(
      COACH,
      result.reportId,
      "admin",
    );
    expect(detail?.id).toBe(result.reportId);
    expect(detail?.session).toBe("Obadiah, Lesson 4");
    expect(await reader.getReportDetail(COACH, result.reportId)).toBeNull();
  });

  it("the session is linked to the report it produced", async () => {
    const result = await svc.publish(input());
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["report_id", "state"])
      .where("source_session_id", "=", "ff-pub-1")
      .executeTakeFirstOrThrow();
    expect(row.report_id).toBe(result.reportId);
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
    const detail = await reader.getReportDetail(
      COACH,
      result.reportId,
      "admin",
    );
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
    const detail = await reader.getReportDetail(
      COACH,
      result.reportId,
      "admin",
    );
    // 5 first-timers (capped at 5) + 11 heads over the threshold (capped at 3).
    expect(detail?.score).toBeCloseTo(84.04, 6);
  });

  it("caps the composite at 100, whatever the bonuses add", async () => {
    const result = await svc.publish(
      input({ base: 99, attendees: 30, newcomers: 9 }),
    );
    const detail = await reader.getReportDetail(
      COACH,
      result.reportId,
      "admin",
    );
    // Every surface renders this as "x / 100".
    expect(detail?.score).toBe(100);
  });

  it("a RE-ATTRIBUTED session MOVES its report rather than making a second one", async () => {
    // An admin correcting a wrong match, or a roster edit changing which
    // keyword wins, used to leave the first report standing under the wrong
    // leader and insert a second under the right one: two reports, two emails,
    // and one session counted twice across two leaders' trends.
    const first = await svc.publish(input());
    await expect(
      svc.publish(input({ coachId: "publish-coach-2" })),
    ).rejects.toBeInstanceOf(AttributionChangedError);
    await conn
      .updateTable("coach_intake_sessions")
      .set({ coach_id: "publish-coach-2" })
      .where("source_session_id", "=", "ff-pub-1")
      .execute();
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

  it("a publish waits on the session row an open re-attribution holds, then sees the new leader and refuses", async () => {
    let commit!: () => void;
    const committing = new Promise<void>((resolve) => {
      commit = resolve;
    });
    let locked!: () => void;
    const holding = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const reattribution = conn.transaction().execute(async (trx) => {
      await trx
        .selectFrom("coach_intake_sessions")
        .select("coach_id")
        .where("source_session_id", "=", "ff-pub-1")
        .forUpdate()
        .execute();
      await trx
        .updateTable("coach_intake_sessions")
        .set({ coach_id: `${COACH}-2` })
        .where("source_session_id", "=", "ff-pub-1")
        .execute();
      locked();
      await committing;
    });
    await holding;
    const publishing = svc.publish(input()).then(
      () => "published",
      (error) => error,
    );
    let blocked = false;
    try {
      for (let i = 0; i < 100 && !blocked; i += 1) {
        const waiting = await sql<{ n: number }>`
          SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND query ILIKE '%coach_intake_sessions%'`.execute(conn);
        blocked = waiting.rows[0].n > 0;
        if (!blocked) await new Promise((r) => setTimeout(r, 20));
      }
    } finally {
      commit();
      await reattribution;
    }
    expect(blocked).toBe(true);
    expect(await publishing).toBeInstanceOf(AttributionChangedError);
    const reports = await conn
      .selectFrom("coach_reports")
      .select("id")
      .where("source_session_id", "=", "ff-pub-1")
      .execute();
    expect(reports).toEqual([]);
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
