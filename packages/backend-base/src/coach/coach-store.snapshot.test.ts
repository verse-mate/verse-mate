import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { backfillCoachRoster } from "./coach-roster.backfill";
import { backfillCoachStore } from "./coach-store.backfill";
import { snapshotDataset } from "./coach-store.snapshot";
import coachDataJson from "./coach.data.json";

const conn = Database.getOrCreateConnection();

type Bundle = Record<string, unknown> & {
  coaches: Array<{ id: string; email: string; reports: unknown[] }>;
  monthlyNarratives?: Record<string, unknown>;
};
const bundle = coachDataJson as unknown as Bundle;
const SLUGS = bundle.coaches.map((c) => c.id);
const EMAILS = bundle.coaches.map((c) => c.email);

/** Canonical JSON: keys sorted at every level, so "byte-comparable" is a real
 *  comparison rather than one that key order can make pass or fail. */
function canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, walk(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** The bundle with its coaches in a defined order — the database has none. */
function normalized(dataset: Bundle): Bundle {
  return {
    ...dataset,
    coaches: [...dataset.coaches].sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", SLUGS)
    .execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
  await conn.deleteFrom("coach_leaders").where("email", "in", EMAILS).execute();
  await conn
    .deleteFrom("coach_monthly_leader_summaries")
    .where("coach_id", "in", SLUGS)
    .execute();
  await conn
    .deleteFrom("coach_monthly_narratives")
    .where("month", "in", Object.keys(bundle.monthlyNarratives ?? { _n: 1 }))
    .execute();
}

describe("store -> bundle snapshot is the rollback path", () => {
  beforeAll(async () => {
    await clear();
    await backfillCoachRoster();
    await backfillCoachStore();
  });
  afterAll(clear);

  it("rebuilds the WHOLE dataset, not just coaches[].reports", async () => {
    const snap = await snapshotDataset();
    // Every top-level key the bundle has. Missing any one of them means step 10
    // of the migration plan has no rollback, because after task 7.1 there is no
    // file left to merge a partial snapshot into.
    expect(Object.keys(snap).sort()).toEqual(Object.keys(bundle).sort());
  });

  it("reproduces the deployed corpus at FULL size, not at two rows", async () => {
    const snap = (await snapshotDataset()) as unknown as Bundle;
    const snapReports = snap.coaches.reduce((n, c) => n + c.reports.length, 0);
    const bundleReports = bundle.coaches.reduce(
      (n, c) => n + c.reports.length,
      0,
    );
    expect(snap.coaches.length).toBe(bundle.coaches.length);
    expect(snapReports).toBe(bundleReports);
  });

  it("is byte-comparable with the deployed bundle under canonical ordering", async () => {
    const snap = (await snapshotDataset()) as unknown as Bundle;
    expect(canonical(normalized(snap))).toBe(canonical(normalized(bundle)));
  });

  it("carries the rubric, the admins and both monthly maps", async () => {
    const snap = (await snapshotDataset()) as unknown as Bundle & {
      admins: string[];
      clusters: unknown[];
      statusBands: unknown[];
      monthlyLeaderSummaries: Record<string, unknown>;
    };
    expect(snap.admins).toEqual(bundle.admins as string[]);
    expect(snap.clusters).toEqual(bundle.clusters as unknown[]);
    expect(snap.statusBands).toEqual(bundle.statusBands as unknown[]);
    expect(Object.keys(snap.monthlyNarratives ?? {}).sort()).toEqual(
      Object.keys(bundle.monthlyNarratives ?? {}).sort(),
    );
    expect(Object.keys(snap.monthlyLeaderSummaries).sort()).toEqual(
      Object.keys(
        bundle.monthlyLeaderSummaries as Record<string, unknown>,
      ).sort(),
    );
  });

  it("orders a coach's reports newest-first, matching the bundle contract", async () => {
    const snap = (await snapshotDataset()) as unknown as Bundle;
    for (const coach of snap.coaches) {
      const dates = (coach.reports as Array<{ date: string }>).map(
        (r) => r.date,
      );
      expect([...dates].sort().reverse()).toEqual(dates);
    }
  });
});
