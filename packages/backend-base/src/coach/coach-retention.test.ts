import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import {
  CoachRetentionService,
  RECORDINGS_KEPT_PER_LEADER,
} from "./coach-retention.service";

const conn = Database.getOrCreateConnection();
const A = "retention-a";
const B = "retention-b";

class FakeStorage {
  deleted: string[] = [];
  async deleteObject(key: string): Promise<boolean> {
    this.deleted.push(key);
    return true;
  }
}

async function seed(coach: string, n: number, kind = "recording") {
  await conn
    .insertInto("coach_session_assets")
    .values({
      coach_id: coach,
      source_session_id: `ff-${coach}-${n}`,
      kind,
      storage_key: `coach/sessions/ff-${coach}-${n}/${kind}`,
      created_at: new Date(Date.UTC(2026, 0, n)),
    })
    .execute();
}

async function clear() {
  for (const c of [A, B]) {
    await conn
      .deleteFrom("coach_session_assets")
      .where("coach_id", "=", c)
      .execute();
    await conn.deleteFrom("coach_reports").where("coach_id", "=", c).execute();
  }
}

function service() {
  const storage = new FakeStorage();
  // biome-ignore lint/suspicious/noExplicitAny: test double
  return { svc: new CoachRetentionService(Database, storage as any), storage };
}

async function keysFor(coach: string, kind = "recording"): Promise<string[]> {
  const rows = await conn
    .selectFrom("coach_session_assets")
    .select("source_session_id")
    .where("coach_id", "=", coach)
    .where("kind", "=", kind)
    .orderBy("created_at")
    .execute();
  return rows.map((r) => r.source_session_id);
}

describe("recordings are bounded per leader", () => {
  beforeEach(clear);
  afterEach(clear);

  it("keeps the four most recent and prunes the fifth", async () => {
    for (const n of [1, 2, 3, 4, 5]) await seed(A, n);
    const { svc, storage } = service();

    const result = await svc.prune();
    expect(result.deleted).toBe(1);
    // The OLDEST goes, the four most recent stay.
    expect(await keysFor(A)).toEqual([
      `ff-${A}-2`,
      `ff-${A}-3`,
      `ff-${A}-4`,
      `ff-${A}-5`,
    ]);
    expect(storage.deleted).toEqual([`coach/sessions/ff-${A}-1/recording`]);
  });

  it("the bound is PER LEADER — one busy leader does not evict another's", async () => {
    for (const n of [1, 2, 3, 4, 5, 6]) await seed(A, n);
    for (const n of [1, 2]) await seed(B, n);
    const { svc } = service();

    await svc.prune();
    expect((await keysFor(A)).length).toBe(RECORDINGS_KEPT_PER_LEADER);
    expect((await keysFor(B)).length).toBe(2);
  });

  it("a leader at or under the bound loses nothing", async () => {
    for (const n of [1, 2, 3, 4]) await seed(A, n);
    const { svc, storage } = service();
    const result = await svc.prune();
    expect(result.deleted).toBe(0);
    expect(storage.deleted).toEqual([]);
    expect((await keysFor(A)).length).toBe(4);
  });

  it("TRANSCRIPTS are not pruned — they last the report's life", async () => {
    // The rule is bounded RECORDINGS. A transcript is small and is the
    // evidence a score is defended with, so it lives as long as the report.
    for (const n of [1, 2, 3, 4, 5, 6]) await seed(A, n, "transcript");
    const { svc, storage } = service();

    await svc.prune();
    expect((await keysFor(A, "transcript")).length).toBe(6);
    expect(storage.deleted).toEqual([]);
  });

  it("pruning is idempotent — a second run deletes nothing more", async () => {
    for (const n of [1, 2, 3, 4, 5]) await seed(A, n);
    const { svc } = service();
    await svc.prune();
    const second = await svc.prune();
    expect(second.deleted).toBe(0);
  });

  it("the row goes only if the object went — a failed delete is retried next sweep", async () => {
    for (const n of [1, 2, 3, 4, 5]) await seed(A, n);
    const failing = {
      deleted: [] as string[],
      async deleteObject(key: string) {
        this.deleted.push(key);
        return false;
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: test double
    const svc = new CoachRetentionService(Database, failing as any);

    const result = await svc.prune();
    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(1);
    // Still there, so the next sweep tries again rather than orphaning bytes.
    expect((await keysFor(A)).length).toBe(5);
  });

  it("a session's material goes when its report is deleted", async () => {
    await conn
      .insertInto("coach_reports")
      .values({
        id: "ret-1",
        coach_id: A,
        session_date: "2026-08-01",
        source_session_id: "ff-ret-1",
        legacy_ids: [],
        summary: {},
        metrics: {},
        body: {},
      })
      .execute();
    await conn
      .insertInto("coach_session_assets")
      .values({
        coach_id: A,
        source_session_id: "ff-ret-1",
        report_id: "ret-1",
        kind: "recording",
        storage_key: "coach/sessions/ff-ret-1/recording",
      })
      .execute();

    await conn.deleteFrom("coach_reports").where("id", "=", "ret-1").execute();
    const left = await conn
      .selectFrom("coach_session_assets")
      .select("id")
      .where("source_session_id", "=", "ff-ret-1")
      .execute();
    // Enforced by the schema (ON DELETE CASCADE), not by remembering to call
    // something — a retention rule nobody can forget.
    expect(left.length).toBe(0);
  });
});
