import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import { db as Database } from "database";

import history from "./coach-bundle-history.fixture.json";
import { runCoachDeployStep } from "./coach-deploy";
import { isolateTable } from "./coach-test-tables";

const conn = Database.getOrCreateConnection();
isolateTable("coach_dataset_meta");
isolateTable("coach_admins");

const ADMIN = "deploy-step-admin@example.test";
const FULL = { ...history.full_171d626d, admins: [ADMIN] };
const STALE = history.stale_dd28af72;
const NO_MAP = { coaches: [] };
const SLUGS = [
  ...new Set(Object.values(history).flatMap((h) => h.coaches.map((c) => c.id))),
];
const reportCount = FULL.coaches.reduce((n, c) => n + c.reports.length, 0);

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", SLUGS)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "in", SLUGS).execute();
  await conn
    .deleteFrom("coach_monthly_leader_summaries")
    .where("coach_id", "in", SLUGS)
    .execute();
  await conn.deleteFrom("coach_admins").execute();
}

async function state() {
  const leaders = await conn
    .selectFrom("coach_leaders")
    .select(["slug", "title_match"])
    .where("slug", "in", SLUGS)
    .orderBy("slug")
    .execute();
  const reports = await conn
    .selectFrom("coach_reports")
    .select(["id", "updated_at"])
    .where("coach_id", "in", SLUGS)
    .orderBy("id")
    .execute();
  const admins = await conn
    .selectFrom("coach_admins")
    .select("email")
    .execute();
  return { leaders, reports, admins: admins.map((a) => a.email) };
}

let errors: ReturnType<typeof spyOn>;
beforeEach(async () => {
  await clear();
  errors = spyOn(console, "error").mockImplementation(() => {});
  spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  errors.mockRestore();
});
afterAll(clear);

describe("the roster and report backfills run at deploy", () => {
  it("A deploy opens the portal without a manual step: leaders, admins and host reports are loaded", async () => {
    await runCoachDeployStep(FULL, NO_MAP);
    const after = await state();
    expect(after.leaders.map((l) => l.slug).sort()).toEqual(
      FULL.coaches.map((c) => c.id).sort(),
    );
    expect(after.reports).toHaveLength(reportCount);
    expect(after.admins).toEqual([ADMIN]);
  });

  it("A deploy with an unchanged bundle changes no row, and an admin's keyword edit is kept", async () => {
    await runCoachDeployStep(FULL, NO_MAP);
    await conn
      .updateTable("coach_leaders")
      .set({ title_match: ["edited by an admin"] })
      .where("slug", "=", FULL.coaches[0].id)
      .execute();
    const before = await state();
    await runCoachDeployStep(FULL, NO_MAP);
    const after = await state();
    expect(after.leaders).toEqual(before.leaders);
    expect(after.reports.map((r) => r.id)).toEqual(
      before.reports.map((r) => r.id),
    );
    expect(after.admins).toEqual(before.admins);
  });

  it("The deploy backfill is refused: nothing is written, the refusal is logged, and the step returns", async () => {
    await runCoachDeployStep(FULL, NO_MAP);
    const before = await state();
    await runCoachDeployStep(STALE, NO_MAP);
    expect(await state()).toEqual(before);
    expect(errors.mock.calls.flat().join(" ")).toContain("Backfill refused");
  });

  it("two processes starting together both finish, and the store holds one copy", async () => {
    await Promise.all([
      runCoachDeployStep(FULL, NO_MAP),
      runCoachDeployStep(FULL, NO_MAP),
    ]);
    const after = await state();
    expect(after.reports).toHaveLength(reportCount);
    expect(after.leaders).toHaveLength(FULL.coaches.length);
    expect(errors).not.toHaveBeenCalled();
  });
});
