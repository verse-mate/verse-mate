import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";
import { db as Database } from "database";

import type { db } from "../shared/shared.plugin";
import { CoachCoverageService } from "./coach-coverage.service";

const conn = Database.getOrCreateConnection();
/** The leader slugs this file owns; every delete is scoped to them. */
const SLUGS = ["cov-observed", "cov-silent", "cov-attested", "cov-noaccount"];
const EMAILS = [
  "cov-noslug@example.test",
  "cov-observed@example.test",
  "cov-silent@example.test",
  "cov-attested@example.test",
  "cov-noaccount@example.test",
];

async function clear() {
  // Scoped. This ran unscoped in BOTH beforeEach and afterEach across 9 tests
  //, 18 full wipes of the intake ledger per run, which strands every
  // published report's watermark, dedupe record and report_id link.
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("coach_id", "in", SLUGS)
    .execute();
  const users = await conn
    .selectFrom("user")
    .select("id")
    .where("email", "in", EMAILS)
    .execute();
  if (users.length > 0) {
    await conn
      .deleteFrom("coach_classes")
      .where(
        "user_id",
        "in",
        users.map((u) => u.id),
      )
      .execute();
  }
  await conn.deleteFrom("user").where("email", "in", EMAILS).execute();
  await conn.deleteFrom("coach_leaders").where("email", "in", EMAILS).execute();
}

/** A registered leader: roster row + account + a class carrying `zoomLink`. */
async function withClass(
  slug: string,
  email: string,
  zoomLink: string,
): Promise<void> {
  await leader(slug, email);
  const user = await conn
    .insertInto("user")
    .values({
      email,
      firstName: slug,
      lastName: "Test",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await conn
    .insertInto("coach_classes")
    .values({
      user_id: user.id,
      name: `${slug} class`,
      zoom_link: zoomLink,
    })
    .execute();
}

async function leader(slug: string, email: string, over = {}) {
  await conn
    .insertInto("coach_leaders")
    .values({ slug, email, name: slug, ...over })
    .execute();
}

async function observed(coachId: string, daysAgo: number) {
  const when = new Date(Date.now() - daysAgo * 86_400_000);
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: `ff-${coachId}-${daysAgo}`,
      coach_id: coachId,
      matched_by: "title_match",
      title: "s",
      session_date: when.toISOString().slice(0, 10),
      observed_at: when,
    })
    .execute();
}

async function assessOnly(slugs: string[]) {
  const rolledBack = new Error("rolled back");
  let report: Awaited<ReturnType<CoachCoverageService["assess"]>> | undefined;
  await conn
    .transaction()
    .execute(async (trx) => {
      await trx
        .updateTable("coach_leaders")
        .set({ is_coach: false })
        .where((eb) =>
          eb.or([eb("slug", "is", null), eb("slug", "not in", slugs)]),
        )
        .execute();
      const scoped = { getOrCreateConnection: () => trx } as unknown as db;
      report = await new CoachCoverageService(scoped).assess({
        windowDays: 30,
      });
      throw rolledBack;
    })
    .catch((e) => {
      if (e !== rolledBack) throw e;
    });
  if (!report) throw new Error("no coverage report");
  return report;
}

describe("bot coverage is OBSERVED, never inferred from configuration", () => {
  beforeEach(clear);
  afterEach(clear);

  it("a leader with a session observed inside the window is covered", async () => {
    // No provider API lists the bot's configured joins, Fireflies exposes
    // Users / Transcripts / Transcript / Bites / Analytics / Active Meetings
    // and nothing that enumerates upcoming or configured joins. So coverage is
    // what intake has actually seen.
    await leader("cov-observed", "cov-observed@example.test");
    await observed("cov-observed", 3);

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-observed");
    expect(row?.covered).toBe(true);
    expect(row?.basis).toBe("observed");
  });

  it("a session OLDER than the window does not count as coverage", async () => {
    await leader("cov-silent", "cov-silent@example.test");
    await observed("cov-silent", 90);

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-silent");
    expect(row?.covered).toBe(false);
    expect(row?.basis).toBe("no-observation");
  });

  it("a leader who is not teaching is covered ONLY by explicit attestation", async () => {
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: new Date(),
    });

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-attested");
    expect(row?.covered).toBe(true);
    expect(row?.basis).toBe("attested-not-teaching");
  });

  it("an uncovered leader is SURFACED, the whole point, since they would silently get no reports", async () => {
    await leader("cov-silent", "cov-silent@example.test");

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    expect(report.uncovered.map((l) => l.coachId)).toContain("cov-silent");
    expect(report.allCovered).toBe(false);
  });

  it("a roster leader with no VerseMate account is classified explicitly, not lumped in", async () => {
    // The roster keys on email; coach_classes keys on user.id. A leader who
    // never registered has no classes row for reasons that have nothing to do
    // with coverage, and saying so is different from saying 'no class linked'.
    await leader("cov-noaccount", "cov-noaccount@example.test");

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-noaccount");
    expect(row?.accountStatus).toBe("no-account");
    expect(row?.classAlert).toBe(false);
  });

  it("a linked class with a NON-EMPTY link and no observed session raises an alert", async () => {
    await withClass(
      "cov-silent",
      "cov-silent@example.test",
      "https://zoom.example/abc",
    );

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-silent");
    expect(row?.covered).toBe(false);
    expect(row?.classAlert).toBe(true);
    expect(row?.linkedClassName).toBe("cov-silent class");
  });

  it("a class row with an EMPTY link raises NOTHING, presence is not intent", async () => {
    // zoom_link is notNull().defaultTo(""), so every class row has the column.
    // Treating the ROW as intent would alert on every leader who ever opened
    // the class form, which is noise an admin learns to ignore, and an alert
    // that gets ignored is worse than no alert.
    await withClass("cov-silent", "cov-silent@example.test", "");

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-silent");
    expect(row?.covered).toBe(false);
    expect(row?.classAlert).toBe(false);
    expect(row?.linkedClassName).toBeNull();
  });

  it("a linked class does NOT make a leader covered, it is intent, not proof", async () => {
    await withClass(
      "cov-silent",
      "cov-silent@example.test",
      "https://zoom.example/abc",
    );
    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    expect(report.allCovered).toBe(false);
  });

  it("allCovered is the gate 9.1 reads before an irreversible step", async () => {
    await leader("cov-observed", "cov-observed@example.test");
    await observed("cov-observed", 1);
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: new Date(),
    });

    const covered = await assessOnly(SLUGS);
    expect(covered.leaders.map((l) => [l.coachId, l.basis])).toEqual([
      ["cov-attested", "attested-not-teaching"],
      ["cov-observed", "observed"],
    ]);
    expect(covered.allCovered).toBe(true);
    expect(covered.uncovered).toEqual([]);

    await leader("cov-silent", "cov-silent@example.test");
    const gap = await assessOnly(SLUGS);
    expect(gap.uncovered.map((l) => l.coachId)).toEqual(["cov-silent"]);
    expect(gap.allCovered).toBe(false);
  });

  it("an empty roster answers, and does not read as every leader covered", async () => {
    const rolledBack = new Error("rolled back");
    let report: Awaited<ReturnType<CoachCoverageService["assess"]>> | undefined;
    await conn
      .transaction()
      .execute(async (trx) => {
        await trx
          .updateTable("coach_leaders")
          .set({ is_coach: false })
          .execute();
        const scoped = { getOrCreateConnection: () => trx } as unknown as db;
        report = await new CoachCoverageService(scoped).assess({
          windowDays: 30,
        });
        throw rolledBack;
      })
      .catch((e) => {
        if (e !== rolledBack) throw e;
      });
    expect(report?.leaders).toEqual([]);
    expect(report?.allCovered).toBe(false);
  });

  it("a leader added without a slug is listed as uncovered, not left out", async () => {
    await conn
      .insertInto("coach_leaders")
      .values({ slug: null, email: "cov-noslug@example.test", name: "No Slug" })
      .execute();
    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.uncovered.find(
      (l) => l.email === "cov-noslug@example.test",
    );
    expect(row?.basis).toBe("no-observation");
    expect(row?.coachId).toBeTruthy();
  });
});

describe("Leader not covered by the bot: an admin attests a leader is not teaching", () => {
  const ADMIN = "cov-attesting-admin@example.test";
  let adminId = "";
  beforeEach(async () => {
    await clear();
    await conn.deleteFrom("user").where("email", "=", ADMIN).execute();
    adminId = (
      await conn
        .insertInto("user")
        .values({ email: ADMIN, firstName: "A", lastName: "D" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    await leader("cov-silent", "cov-silent@example.test");
  });
  afterEach(async () => {
    await clear();
    await conn.deleteFrom("user").where("email", "=", ADMIN).execute();
  });

  const silentRow = async () =>
    (
      await new CoachCoverageService(Database).assess({ windowDays: 30 })
    ).leaders.find((l) => l.coachId === "cov-silent");

  it("the attestation is recorded with who and when, and the leader is covered as attested, not observed", async () => {
    const service = new CoachCoverageService(Database);
    expect(await service.attestNotTeaching("cov-silent", adminId)).toBe(true);

    const report = await service.assess({ windowDays: 30 });
    const row = report.leaders.find((l) => l.coachId === "cov-silent");
    expect(row).toMatchObject({
      covered: true,
      basis: "attested-not-teaching",
      attestedBy: ADMIN,
    });
    expect(Date.now() - Date.parse(row?.attestedAt as string)).toBeLessThan(
      60_000,
    );
    expect(report.uncovered.map((l) => l.coachId)).not.toContain("cov-silent");
  });

  it("clearing the attestation makes the silent leader uncovered again", async () => {
    const service = new CoachCoverageService(Database);
    await service.attestNotTeaching("cov-silent", adminId);
    expect(await service.clearNotTeaching("cov-silent")).toBe(true);

    expect(await silentRow()).toMatchObject({
      covered: false,
      basis: "no-observation",
      attestedAt: null,
      attestedBy: null,
    });
  });

  it("a leader never attested reports no attestation", async () => {
    expect(await silentRow()).toMatchObject({
      basis: "no-observation",
      attestedAt: null,
      attestedBy: null,
    });
  });

  it("an unknown leader is refused", async () => {
    const service = new CoachCoverageService(Database);
    expect(await service.attestNotTeaching("cov-nobody", adminId)).toBe(false);
    expect(await service.clearNotTeaching("cov-nobody")).toBe(false);
  });
});

describe("a not-teaching attestation lapses, and an observed session ends it", () => {
  beforeEach(clear);
  afterEach(clear);

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  async function row(slug: string) {
    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    return report.leaders.find((l) => l.coachId === slug);
  }

  it("Leader not covered by the bot: no observation and no attestation is uncovered, distinctly from an attested absence", async () => {
    await leader("cov-silent", "cov-silent@example.test");
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: daysAgo(10),
    });
    expect(await row("cov-silent")).toMatchObject({
      covered: false,
      basis: "no-observation",
      attestedAt: null,
    });
    expect(await row("cov-attested")).toMatchObject({
      covered: true,
      basis: "attested-not-teaching",
    });
  });

  it("A not-teaching attestation lapses: older than eight weeks with no session since, it is uncovered and shown lapsed with its date", async () => {
    const attested = daysAgo(57);
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: attested,
    });
    const lapsed = await row("cov-attested");
    expect(lapsed).toMatchObject({
      covered: false,
      basis: "attestation-lapsed",
      attestedAt: attested.toISOString(),
    });
    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    expect(report.uncovered.map((l) => l.coachId)).toContain("cov-attested");
  });

  it("an attestation inside eight weeks still covers", async () => {
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: daysAgo(55),
    });
    expect(await row("cov-attested")).toMatchObject({
      covered: true,
      basis: "attested-not-teaching",
    });
  });

  it("a fresh attestation restarts the eight weeks", async () => {
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: daysAgo(70),
    });
    expect((await row("cov-attested"))?.basis).toBe("attestation-lapsed");
    const admin = await conn
      .insertInto("user")
      .values({
        email: "cov-attested@example.test",
        firstName: "A",
        lastName: "T",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await new CoachCoverageService(Database).attestNotTeaching(
      "cov-attested",
      admin.id,
    );
    expect(await row("cov-attested")).toMatchObject({
      covered: true,
      basis: "attested-not-teaching",
    });
  });

  it("An observed session ends an attestation: a session after it, then silence across the window, is uncovered", async () => {
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: daysAgo(50),
    });
    await observed("cov-attested", 40);
    expect(await row("cov-attested")).toMatchObject({
      covered: false,
      basis: "no-observation",
      attestedAt: null,
      attestedBy: null,
    });
  });

  it("a session observed before the attestation does not end it", async () => {
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: daysAgo(20),
    });
    await observed("cov-attested", 40);
    expect(await row("cov-attested")).toMatchObject({
      covered: true,
      basis: "attested-not-teaching",
    });
  });
});

describe("the eight-week lapse, on a frozen clock", () => {
  const ATTESTED = new Date("2026-06-01T12:00:00.000Z");
  const MINUTE = 60_000;
  const EIGHT_WEEKS = 56 * 86_400_000;

  beforeEach(clear);
  afterEach(async () => {
    setSystemTime();
    await clear();
  });

  async function basisAt(now: Date) {
    setSystemTime(now);
    return (
      await new CoachCoverageService(Database).assess({ windowDays: 30 })
    ).leaders.find((l) => l.coachId === "cov-attested");
  }

  async function observedAt(when: Date, id: string) {
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: `ff-cov-attested-${id}`,
        coach_id: "cov-attested",
        matched_by: "title_match",
        title: "s",
        session_date: when.toISOString().slice(0, 10),
        observed_at: when,
      })
      .execute();
  }

  it("56 days less a minute after the attestation it still covers; 56 days and a minute after, it has lapsed", async () => {
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: ATTESTED,
    });
    expect(
      await basisAt(new Date(ATTESTED.getTime() + EIGHT_WEEKS - MINUTE)),
    ).toMatchObject({ covered: true, basis: "attested-not-teaching" });
    expect(
      await basisAt(new Date(ATTESTED.getTime() + EIGHT_WEEKS + MINUTE)),
    ).toMatchObject({
      covered: false,
      basis: "attestation-lapsed",
      attestedAt: ATTESTED.toISOString(),
    });
  });

  it("a session observed at the very instant of the attestation does not end it", async () => {
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: ATTESTED,
    });
    await observedAt(ATTESTED, "same-instant");
    expect(
      await basisAt(new Date(ATTESTED.getTime() + 40 * 86_400_000)),
    ).toMatchObject({
      covered: true,
      basis: "attested-not-teaching",
      attestedAt: ATTESTED.toISOString(),
    });
  });

  it("a fresh attestation after a session ended the earlier one covers again, for eight weeks from the fresh one", async () => {
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: ATTESTED,
    });
    const session = new Date(ATTESTED.getTime() + 10 * 86_400_000);
    await observedAt(session, "after");
    expect(
      await basisAt(new Date(session.getTime() + 40 * 86_400_000)),
    ).toMatchObject({ covered: false, basis: "no-observation" });

    const fresh = new Date(session.getTime() + 20 * 86_400_000);
    await conn
      .updateTable("coach_leaders")
      .set({ not_teaching_attested_at: fresh })
      .where("slug", "=", "cov-attested")
      .execute();
    expect(
      await basisAt(new Date(fresh.getTime() + EIGHT_WEEKS - MINUTE)),
    ).toMatchObject({
      covered: true,
      basis: "attested-not-teaching",
      attestedAt: fresh.toISOString(),
    });
    expect(
      await basisAt(new Date(fresh.getTime() + EIGHT_WEEKS + MINUTE)),
    ).toMatchObject({ covered: false, basis: "attestation-lapsed" });
  });
});
