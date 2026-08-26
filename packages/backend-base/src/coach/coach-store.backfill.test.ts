import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { backfillCoachStore } from "./coach-store.backfill";
import coachDataJson from "./coach.data.json";

const conn = Database.getOrCreateConnection();
const deployedCount = (coachDataJson as { coaches: any[] }).coaches.reduce(
  (n, c) => n + c.reports.length,
  0,
);

async function clear() {
  await conn.deleteFrom("coach_reports").execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

describe("coach-store backfill (DB)", () => {
  beforeAll(clear);
  afterAll(clear);

  it("loads exactly the deployed report count into coach_reports", async () => {
    const { loaded } = await backfillCoachStore();
    expect(loaded).toBe(deployedCount);
    const rows = await conn
      .selectFrom("coach_reports")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow();
    expect(Number(rows.n)).toBe(deployedCount);
  });

  it("sets meta.report_count from the file's own count", async () => {
    const meta = await conn
      .selectFrom("coach_dataset_meta")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(meta.report_count).toBe(deployedCount);
  });

  it("is idempotent: re-running loads the same corpus, no duplicates", async () => {
    await backfillCoachStore();
    const rows = await conn
      .selectFrom("coach_reports")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow();
    expect(Number(rows.n)).toBe(deployedCount);
  });

  it("backfilled id equals the deployed slug (overlay joins survive)", async () => {
    const sample = (coachDataJson as any).coaches[0].reports[0];
    const row = await conn
      .selectFrom("coach_reports")
      .select(["id", "coach_id"])
      .where("id", "=", sample.id)
      .executeTakeFirst();
    expect(row?.id).toBe(sample.id);
  });
});
