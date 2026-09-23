import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";

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
});
