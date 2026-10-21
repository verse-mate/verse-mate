import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import {
  FIXTURE_ADMIN,
  FIXTURE_LEADERS,
  FIXTURE_MONTH,
  FIXTURE_NARRATIVE,
  FIXTURE_REPORTS,
  clearCoachFixture,
  seedCoachFixture,
} from "./coach-fixture";
import { CoachGovernanceService } from "./coach-governance.service";
import { isolateTable } from "./coach-test-tables";
import { CoachService } from "./coach.service";
import { CoachRepository } from "./repository/coach.repository";

isolateTable("coach_admins");

const conn = Database.getOrCreateConnection();
const service = new CoachService(Database);
const [AVERY, JORDAN] = FIXTURE_LEADERS;
const LEGACY = FIXTURE_REPORTS[1];

async function confirmedUser(email: string): Promise<string> {
  await conn.deleteFrom("user").where("email", "=", email).execute();
  const { id } = await conn
    .insertInto("user")
    .values({ email, firstName: "F", lastName: "L", emailVerified: true })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

async function clear() {
  await clearCoachFixture(Database);
  await conn
    .deleteFrom("user")
    .where("email", "in", [AVERY.email, FIXTURE_ADMIN])
    .execute();
}

describe("the coach service reads the database only", () => {
  let leaderId = "";
  let adminId = "";

  beforeAll(async () => {
    await clear();
    await seedCoachFixture(Database);
    leaderId = await confirmedUser(AVERY.email);
    adminId = await confirmedUser(FIXTURE_ADMIN);
    const repo = new CoachRepository(Database);
    await repo.setRecordingLink(
      AVERY.slug,
      LEGACY.report.id,
      "https://example.org/recordings/one",
    );
    await repo.addNote({
      coachId: AVERY.slug,
      reportId: LEGACY.report.id,
      authorUserId: null,
      body: "Good pacing in the second half.",
      emailed: false,
    });
  });
  afterAll(clear);

  it("a leader with legacy reports signs in and reads sessions, a report, trends and a monthly summary", async () => {
    const me = await service.getMe(leaderId);
    expect(me?.isCoach).toBe(true);
    expect(me?.profile?.id).toBe(AVERY.slug);

    const reports = (await service.getReports(leaderId)) ?? [];
    expect(reports.map((r) => r.id)).toEqual([
      "fixture-avery-2033-03-15",
      "fixture-avery-2033-03-08",
      "fixture-avery-2033-02-22",
    ]);
    const page = await service.getReportSummaries(AVERY.slug);
    expect(page.total).toBe(3);

    const detail = await service.getReportDetail(
      AVERY.slug,
      "fixture-avery-2033-03-15",
    );
    expect(detail?.feedback.headline).toBe(
      FIXTURE_REPORTS[2].report.feedback.headline,
    );

    const trends = await service.getTrends(leaderId);
    expect(trends?.scoreSeries.map((p) => p.score)).toEqual([66.4, 74.2, 81]);

    const monthly = await service.getMyMonthlySummary(leaderId, FIXTURE_MONTH);
    expect(monthly?.summary?.leaderName).toBe(AVERY.name);
    expect(monthly?.availableMonths).toEqual(["2033-03", "2033-02"]);
  });

  it("a report link sent before the change opens the same report, with its note and recording link", async () => {
    const [legacyId] = LEGACY.legacyIds;
    const report = await service.getReportDetail(AVERY.slug, legacyId);
    expect(report?.id).toBe(LEGACY.report.id);
    expect(report?.recordingUrl).toBe("https://example.org/recordings/one");
    expect(report?.notes?.map((n) => n.body)).toEqual([
      "Good pacing in the second half.",
    ]);
    expect(await service.getReportDetail(JORDAN.slug, legacyId)).toBeNull();
  });

  it("an admin opens the roster with names, groups, session counts and latest sessions", async () => {
    expect(await service.isAdmin(adminId)).toBe(true);
    const roster = (await service.listCoaches()).filter((c) =>
      c.id.startsWith("fixture-"),
    );
    expect(
      roster
        .map((c) => ({
          id: c.id,
          name: c.name,
          group: c.group,
          sessions: c.sessionCount,
          latest: c.latest?.date,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual([
      {
        id: AVERY.slug,
        name: AVERY.name,
        group: AVERY.group,
        sessions: 3,
        latest: "2033-03-15",
      },
      {
        id: JORDAN.slug,
        name: JORDAN.name,
        group: JORDAN.group,
        sessions: 1,
        latest: "2033-03-10",
      },
    ]);
    const monthly = await service.getMonthly(FIXTURE_MONTH);
    expect(monthly.narrative).toEqual(FIXTURE_NARRATIVE);
  });

  it("an unknown leader id resolves to nothing", async () => {
    expect(await service.getReportsById("fixture-nobody")).toBeNull();
  });
});

describe("an environment with no benchmark leader marked", () => {
  beforeAll(() => seedCoachFixture(Database));
  afterAll(() => clearCoachFixture(Database));

  it("does not hold a report that names another leader", async () => {
    const rolledBack = new Error("rolled back");
    let verdict: unknown;
    await conn
      .transaction()
      .execute(async (trx) => {
        await trx
          .updateTable("coach_leaders")
          .set({ is_benchmark: false })
          .execute();
        verdict = await new CoachGovernanceService({
          getOrCreateConnection: () => trx,
        } as never).check({
          reportId: "fixture-governance",
          coachId: JORDAN.slug,
          body: `${AVERY.name} opened with a question the room could answer.`,
          evidence: { quotes: [], timestamps: [] },
        });
        throw rolledBack;
      })
      .catch((e) => {
        if (e !== rolledBack) throw e;
      });
    expect(verdict).toEqual({ passed: true, violations: [] });
  });
});
