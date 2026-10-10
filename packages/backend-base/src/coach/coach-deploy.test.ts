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
import { sql } from "kysely";

import history from "./coach-bundle-history.fixture.json";
import { DEPLOY_LOCK, runCoachDeployStep } from "./coach-deploy";
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
    .selectAll()
    .where("slug", "in", SLUGS)
    .orderBy("slug")
    .execute();
  const reports = await conn
    .selectFrom("coach_reports")
    .selectAll()
    .where("coach_id", "in", SLUGS)
    .orderBy("id")
    .execute();
  const summaries = await conn
    .selectFrom("coach_monthly_leader_summaries")
    .selectAll()
    .where("coach_id", "in", SLUGS)
    .orderBy("coach_id")
    .orderBy("month")
    .execute();
  const meta = await conn
    .selectFrom("coach_dataset_meta")
    .selectAll()
    .execute();
  const admins = await conn
    .selectFrom("coach_admins")
    .select("email")
    .execute();
  return {
    leaders,
    reports,
    summaries,
    meta,
    admins: admins.map((a) => a.email),
  };
}

function holdDeployLock() {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let taken = () => {};
  const held = new Promise<void>((resolve) => {
    taken = resolve;
  });
  const done = conn.connection().execute(async (c) => {
    await sql`SELECT pg_advisory_lock(${DEPLOY_LOCK})`.execute(c);
    taken();
    await released;
    await sql`SELECT pg_advisory_unlock(${DEPLOY_LOCK})`.execute(c);
  });
  return {
    held,
    release: () => {
      release();
      return done;
    },
  };
}

let errors: ReturnType<typeof spyOn>;
let logs: ReturnType<typeof spyOn>;
beforeEach(async () => {
  await clear();
  errors = spyOn(console, "error").mockImplementation(() => {});
  logs = spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  errors.mockRestore();
  logs.mockRestore();
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
    expect(await state()).toEqual(before);
  });

  it("The deploy backfill is refused: nothing is written, the refusal is logged naming the leader, and the step returns", async () => {
    await runCoachDeployStep(FULL, NO_MAP);
    const before = await state();
    await runCoachDeployStep(STALE, NO_MAP);
    expect(await state()).toEqual(before);
    const logged = errors.mock.calls.flat().join(" ");
    expect(logged).toContain("Backfill refused");
    expect(logged).toMatch(/\d+ reports in the bundle, \d+ in the store/);
  });

  it("a second process waits for the first one's lock, then finds nothing to do", async () => {
    const lock = holdDeployLock();
    await lock.held;
    const step = runCoachDeployStep(FULL, NO_MAP);
    await Bun.sleep(300);
    expect((await state()).reports).toHaveLength(0);
    await lock.release();
    await step;
    expect((await state()).reports).toHaveLength(reportCount);
    expect(errors).not.toHaveBeenCalled();
  });

  it("a lock held too long gives up with a log line, so the API still starts", async () => {
    const lock = holdDeployLock();
    await lock.held;
    try {
      await runCoachDeployStep(FULL, NO_MAP, { lockTimeout: "200ms" });
      expect((await state()).reports).toHaveLength(0);
      expect(errors.mock.calls.flat().join(" ")).toContain(
        "[coach-deploy] skipped",
      );
    } finally {
      await lock.release();
    }
  });

  it("a roster backfill that fails part way is logged, the report backfill still runs, and the lock is released", async () => {
    const taken = FULL.coaches[0];
    await conn
      .insertInto("coach_leaders")
      .values({ slug: "deploy-step-other", email: taken.email, name: "Other" })
      .execute();
    try {
      await runCoachDeployStep(FULL, NO_MAP);
      expect(errors.mock.calls.flat().join(" ")).toContain(
        "[coach-deploy] roster backfill failed",
      );
      expect((await state()).reports).toHaveLength(reportCount);
      await runCoachDeployStep(FULL, NO_MAP);
    } finally {
      await conn
        .deleteFrom("coach_leaders")
        .where("slug", "=", "deploy-step-other")
        .execute();
    }
  });

  it("the deploy backfill clears a confirmation made before the deploy on an address it adds, and only there", async () => {
    const address = FULL.coaches[0].email;
    const stranger = "deploy-step-stranger@example.test";
    const ids: string[] = [];
    for (const email of [address, stranger]) {
      const { id } = await conn
        .insertInto("user")
        .values({
          email,
          firstName: "D",
          lastName: "S",
          emailVerified: true,
          password: "hash",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await conn
        .updateTable("user")
        .set({ email_verified_at: null })
        .where("id", "=", id)
        .execute();
      ids.push(id);
    }
    try {
      await runCoachDeployStep(FULL, NO_MAP);
      const flags = await conn
        .selectFrom("user")
        .select(["id", "emailVerified"])
        .where("id", "in", ids)
        .execute();
      expect(
        Object.fromEntries(flags.map((f) => [f.id, f.emailVerified])),
      ).toEqual({ [ids[0]]: false, [ids[1]]: true });
    } finally {
      await conn.deleteFrom("user").where("id", "in", ids).execute();
    }
  });
});
