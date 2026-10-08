import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { db as Database } from "database";

import history from "./coach-bundle-history.fixture.json";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { backfillCoachStore } from "./coach-store.backfill";
import coachDataJson from "./coach.data.json";

const conn = Database.getOrCreateConnection();

type Bundle = {
  coaches: Array<{ id: string; reports: Array<{ id: string }> }>;
};
const bundle = coachDataJson as unknown as Bundle;

// EVERY expected figure is derived from the bundle this run reads, never a
// literal: the corpus grows weekly (16 leaders / 112 reports on 2026-08-26,
// 17 / 119 by 2026-09-01), so a hardcoded count is stale on arrival.
const BUNDLE_COACH_IDS = bundle.coaches.map((c) => c.id);
const deployedCount = bundle.coaches.reduce((n, c) => n + c.reports.length, 0);
const perLeader = new Map(
  bundle.coaches.map((c) => [c.id, c.reports.length] as const),
);

// Scope every delete to the coaches THIS file writes. An unscoped
// `deleteFrom(coach_reports)` wipes the whole corpus on whatever database
// POSTGRES_URL happens to point at, which is how a dev run reaches production.
async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", BUNDLE_COACH_IDS)
    .execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

async function countsByCoach(): Promise<Map<string, number>> {
  const rows = await conn
    .selectFrom("coach_reports")
    .select(["coach_id"])
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("coach_id", "in", BUNDLE_COACH_IDS)
    .groupBy("coach_id")
    .execute();
  return new Map(rows.map((r) => [r.coach_id, Number(r.n)]));
}

describe("coach-store backfill (DB)", () => {
  beforeAll(clear);
  afterAll(clear);

  it("loads exactly the deployed report count, per leader as well as overall", async () => {
    const { loaded } = await backfillCoachStore();
    expect(loaded).toBe(deployedCount);

    const counts = await countsByCoach();
    // Per-leader, so a shortfall in one leader cannot hide inside the total.
    for (const [coachId, expected] of perLeader) {
      expect(counts.get(coachId) ?? 0).toBe(expected);
    }
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(deployedCount);
  });

  it("sets meta.report_count from the file's own count", async () => {
    const meta = await conn
      .selectFrom("coach_dataset_meta")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(meta.report_count).toBe(deployedCount);
  });

  it("backfilled id equals the deployed slug (overlay joins survive)", async () => {
    const sample = bundle.coaches[0].reports[0];
    const row = await conn
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "source_session_id"])
      .where("id", "=", sample.id)
      .executeTakeFirst();
    expect(row?.id).toBe(sample.id);
    // …and it carries the title-free sentinel, not a slug-derived value.
    expect(row?.source_session_id).toBe(
      `legacy:${row?.coach_id}:${(sample as { date?: string }).date ?? ""}`,
    );
  });

  it("re-running after a RE-TITLE lands the same corpus, not a duplicate of it", async () => {
    // The failure this guards: a source_session_id derived from the report id
    // (a slug carrying the session title) changes when a session is re-titled,
    // so the second run inserts beside the first and the corpus doubles.
    const retitled = structuredClone(bundle) as Bundle & {
      coaches: Array<{
        id: string;
        reports: Array<{ id: string; session?: string; date?: string }>;
      }>;
    };
    const target = retitled.coaches[0].reports[0];
    target.session = `${target.session ?? "Session"} (renamed)`;
    target.id = `${target.id}-retitled`;

    const { loaded } = await backfillCoachStore(retitled);
    expect(loaded).toBe(deployedCount);

    const counts = await countsByCoach();
    for (const [coachId, expected] of perLeader) {
      expect(counts.get(coachId) ?? 0).toBe(expected);
    }
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(deployedCount);
  });
  it("re-running after a session was re-attributed updates it instead of aborting on the one-report-per-session index", async () => {
    await backfillCoachStore();
    const sample = bundle.coaches[0].reports[0];
    const otherLeader = bundle.coaches[1].id;
    await conn
      .updateTable("coach_reports")
      .set({ coach_id: otherLeader })
      .where("id", "=", sample.id)
      .execute();

    const { loaded } = await backfillCoachStore();
    expect(loaded).toBe(deployedCount);

    const rows = await conn
      .selectFrom("coach_reports")
      .select(["id", "coach_id"])
      .where("id", "=", sample.id)
      .execute();
    expect(rows).toEqual([{ id: sample.id, coach_id: otherLeader }]);
    const counts = await countsByCoach();
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(deployedCount);
  });

  it("Cutover switches the pipeline on: the backfill is not run again", async () => {
    await clear();
    process.env[COACH_PIPELINE_LIVE] = "true";
    try {
      await expect(backfillCoachStore()).rejects.toThrow(/cutover/);
    } finally {
      delete process.env[COACH_PIPELINE_LIVE];
    }
    expect((await countsByCoach()).size).toBe(0);
  });
});

describe("The Backfill Never Shrinks The Store", () => {
  const FULL = history.full_171d626d;
  const STALE = history.stale_dd28af72;
  const REWRITTEN = "avery-hollis-2026-10-01-lakeside-midweek-group-zoom-amos";
  const STALE_SCORED =
    "avery-hollis-2026-07-18-james-lesson-9-riverbend-sunday-";
  const MACHINE = ["ff-backfill-machine-1", "ff-backfill-machine-2"];

  async function report(id: string) {
    return conn
      .selectFrom("coach_reports")
      .select(["id", "summary", "metrics", "held", "updated_at"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }

  async function snapshot() {
    return {
      reports: await conn
        .selectFrom("coach_reports")
        .selectAll()
        .where("coach_id", "in", BUNDLE_COACH_IDS)
        .orderBy("id")
        .execute(),
      summaries: await conn
        .selectFrom("coach_monthly_leader_summaries")
        .selectAll()
        .where("coach_id", "in", BUNDLE_COACH_IDS)
        .orderBy(["coach_id", "month"])
        .execute(),
      meta: await conn.selectFrom("coach_dataset_meta").selectAll().execute(),
    };
  }

  async function clearAll() {
    await clear();
    await conn
      .deleteFrom("coach_monthly_leader_summaries")
      .where("coach_id", "in", BUNDLE_COACH_IDS)
      .execute();
  }

  beforeEach(clearAll);
  afterAll(clearAll);

  it("A bundle missing reports is refused: the stale dd28af72 publish after the full one writes nothing and names each leader with both counts", async () => {
    await backfillCoachStore(FULL);
    await conn
      .insertInto("coach_monthly_leader_summaries")
      .values(
        Object.entries(FULL.monthlyLeaderSummaries).flatMap(
          ([coachId, byMonth]) =>
            Object.entries(byMonth).map(([month, summary]) => ({
              coach_id: coachId,
              month,
              summary: JSON.stringify(summary),
            })),
        ),
      )
      .execute();
    const before = await snapshot();

    const refusal = backfillCoachStore(STALE);
    await expect(refusal).rejects.toThrow(
      "avery-hollis: 23 reports in the bundle, 33 in the store",
    );
    await expect(backfillCoachStore(STALE)).rejects.toThrow(
      "desmond-ortiz: 2 reports in the bundle, 8 in the store",
    );
    expect(await snapshot()).toEqual(before);
    expect((await report(STALE_SCORED)).summary).toMatchObject({
      score: 84.61,
    });
  });

  it("a bundle missing leader-month summaries is refused even when its reports are complete", async () => {
    await backfillCoachStore(FULL);
    await conn
      .insertInto("coach_monthly_leader_summaries")
      .values(
        ["2026-05", "2026-06", "2026-07"].map((month) => ({
          coach_id: "desmond-ortiz",
          month,
          summary: JSON.stringify({ month }),
        })),
      )
      .execute();
    const before = await snapshot();
    const thinned: { monthlyLeaderSummaries: Record<string, unknown> } =
      structuredClone(FULL);
    thinned.monthlyLeaderSummaries["desmond-ortiz"] = {};

    await expect(backfillCoachStore(thinned)).rejects.toThrow(
      "desmond-ortiz: 0 leader-month summaries in the bundle, 3 in the store",
    );
    expect(await snapshot()).toEqual(before);
  });

  it("a bundle missing exactly one report per leader is refused for every leader", async () => {
    await backfillCoachStore(FULL);
    const before = await snapshot();
    const short: Bundle = structuredClone(FULL) as unknown as Bundle;
    for (const coach of short.coaches) coach.reports.pop();

    const refusal = await backfillCoachStore(short).then(
      () => "",
      (error: Error) => error.message,
    );
    for (const coach of (FULL as unknown as Bundle).coaches)
      expect(refusal).toContain(
        `${coach.id}: ${coach.reports.length - 1} reports in the bundle, ${coach.reports.length} in the store`,
      );
    expect(await snapshot()).toEqual(before);
  });

  it("a bundle missing exactly one leader-month summary is refused", async () => {
    await backfillCoachStore(FULL);
    await conn
      .insertInto("coach_monthly_leader_summaries")
      .values(
        ["2026-05", "2026-06"].map((month) => ({
          coach_id: "desmond-ortiz",
          month,
          summary: JSON.stringify({ month }),
        })),
      )
      .execute();
    const short: { monthlyLeaderSummaries: Record<string, unknown> } =
      structuredClone(FULL);
    short.monthlyLeaderSummaries["desmond-ortiz"] = { "2026-05": {} };
    await expect(backfillCoachStore(short)).rejects.toThrow(
      "desmond-ortiz: 1 leader-month summaries in the bundle, 2 in the store",
    );
  });

  it("A report rewritten upstream under the same id: 65d63a2b after e30ac351 moves the 2026-10-01 report from 78.85 to 82.48 in place, the null dimension included", async () => {
    await backfillCoachStore(history.before_e30ac351);
    expect((await report(REWRITTEN)).summary).toMatchObject({ score: 78.85 });

    await backfillCoachStore(history.after_65d63a2b);
    const after = await report(REWRITTEN);
    expect(after.summary).toMatchObject({ score: 82.48 });
    const dimensions = (after.metrics as { dimensions: Array<{ n: number }> })
      .dimensions;
    expect(dimensions.find((d) => d.n === 9)).toMatchObject({ score: null });
    const rows = await conn
      .selectFrom("coach_reports")
      .select("id")
      .where("coach_id", "=", "avery-hollis")
      .execute();
    expect(rows).toEqual([{ id: REWRITTEN }]);
  });

  it("The store also holds machine-scored reports: they are neither counted against the bundle nor changed", async () => {
    await backfillCoachStore(history.before_e30ac351);
    for (const id of MACHINE) {
      await conn
        .insertInto("coach_reports")
        .values({
          id,
          coach_id: "avery-hollis",
          session_date: "2026-10-01",
          source_session_id: id,
          legacy_ids: [],
          summary: JSON.stringify({ score: 61 }),
          metrics: {},
          body: {},
          held: true,
        })
        .execute();
    }
    const machineBefore = await Promise.all(MACHINE.map(report));

    await backfillCoachStore(history.after_65d63a2b);

    expect(await Promise.all(MACHINE.map(report))).toEqual(machineBefore);
    expect((await report(REWRITTEN)).summary).toMatchObject({ score: 82.48 });
    const meta = await conn
      .selectFrom("coach_dataset_meta")
      .select("report_count")
      .executeTakeFirstOrThrow();
    expect(meta.report_count).toBe(1);
  });

  it("never lowers the stored report count, and advances the version on every write", async () => {
    await conn
      .insertInto("coach_dataset_meta")
      .values({ id: true, version: "7", report_count: 500 })
      .execute();
    await backfillCoachStore(FULL);
    const meta = await conn
      .selectFrom("coach_dataset_meta")
      .select(["report_count", "version"])
      .executeTakeFirstOrThrow();
    expect(meta.report_count).toBe(500);
    expect(Number(meta.version)).toBe(8);
  });
});
