import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
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
import {
  AdminCoachClassSchema,
  CoachClassSchema,
  ReportSchema,
} from "./coach.schema";
import {
  type CoachReport,
  type CoachSendResult,
  CoachService,
} from "./coach.service";
import { CoachClassDto } from "./dto/coach.dto";
import { CoachRepository } from "./repository/coach.repository";

const LEADER = FIXTURE_LEADERS[0].slug;
const LEADER_EMAIL = FIXTURE_LEADERS[0].email;

// buildTrends is a pure static — exercise it without a DB connection.

function report(over: Partial<CoachReport>): CoachReport {
  return {
    id: "r",
    date: "2026-01-01",
    dateLabel: "January 1, 2026",
    session: "Session",
    topic: "Topic",
    duration: "1h",
    attendees: 10,
    newcomers: 0,
    score: 70,
    base: 70,
    newcomerBonus: 0,
    sizeBonus: 0,
    status: "On Target",
    statusEmoji: "🟡",
    clusters: [
      { name: "Teaching Craft", weight: 33, scorePct: 70, contribution: 23.1 },
    ],
    dimensions: [
      { n: 1, name: "Session Structure & Flow", score: 4 },
      { n: 2, name: "Newcomer Welcome", score: null },
    ],
    bigIdeas: [],
    feedback: {
      headline: "",
      strengths: [],
      improvements: [],
      recommendations: [],
    },
    docUrl: "",
    pdfUrl: "",
    ...over,
  };
}

describe("CoachService.buildTrends", () => {
  it("sorts reports oldest-first for the score series", () => {
    const trends = CoachService.buildTrends([
      report({ id: "b", date: "2026-03-01", score: 80 }),
      report({ id: "a", date: "2026-01-01", score: 60 }),
    ]);
    expect(trends.scoreSeries.map((p) => p.date)).toEqual([
      "2026-01-01",
      "2026-03-01",
    ]);
    expect(trends.scoreSeries.map((p) => p.score)).toEqual([60, 80]);
    expect(trends.scoreSeries.map((p) => p.reportId)).toEqual(["a", "b"]);
  });

  it("computes the latest-vs-previous delta", () => {
    const trends = CoachService.buildTrends([
      report({ date: "2026-01-01", dateLabel: "Jan 1", score: 60 }),
      report({ date: "2026-02-01", dateLabel: "Feb 1", score: 68.5 }),
    ]);
    expect(trends.delta).toEqual({
      score: 8.5,
      from: 60,
      to: 68.5,
      fromLabel: "Jan 1",
      toLabel: "Feb 1",
    });
  });

  it("has no delta for a single session", () => {
    const trends = CoachService.buildTrends([report({})]);
    expect(trends.delta).toBeNull();
  });

  it("preserves N/A dimensions as null (gapped line, not zero)", () => {
    const trends = CoachService.buildTrends([report({})]);
    expect(trends.dimensionSeries[0]["Newcomer Welcome"]).toBeNull();
    expect(trends.dimensionSeries[0]["Session Structure & Flow"]).toBe(4);
  });

  it("keys cluster series rows by cluster name", () => {
    const trends = CoachService.buildTrends([report({})]);
    expect(trends.clusterSeries[0]["Teaching Craft"]).toBe(23.1);
  });
});

describe("ReportSchema prose fields", () => {
  // Elysia enforces the response schema by CLEANING the value against it —
  // any property not declared in the schema is stripped before it is sent.
  // Value.Clean reproduces that exact step, so this guards the regression the
  // prose feature was built to prevent: the pipeline emits *Prose fields, and
  // if they were absent from ReportSchema the API would silently delete them.
  it("keeps overview + *Prose on a report carrying prose (not stripped)", () => {
    const withProse = report({
      feedback: {
        headline: "A strong session.",
        strengths: ["terse"],
        improvements: ["terse"],
        recommendations: ["terse"],
        overview: ["Overall paragraph one.", "Overall paragraph two."],
        strengthsProse: [
          {
            title: "Exceptional discussion balance (32% leader talk)",
            paragraphs: ["Para one.", "Para two."],
          },
        ],
        improvementsProse: [{ title: "Growth", paragraphs: ["Para."] }],
        recommendationsProse: [{ title: "Next", paragraphs: ["Para."] }],
      },
    });

    // structuredClone so Clean doesn't mutate the fixture in place.
    const cleaned = Value.Clean(
      ReportSchema,
      structuredClone(withProse),
    ) as CoachReport;

    expect(cleaned.feedback.overview).toEqual([
      "Overall paragraph one.",
      "Overall paragraph two.",
    ]);
    expect(cleaned.feedback.strengthsProse?.[0]).toEqual({
      title: "Exceptional discussion balance (32% leader talk)",
      paragraphs: ["Para one.", "Para two."],
    });
    expect(cleaned.feedback.improvementsProse?.[0]?.title).toBe("Growth");
    expect(cleaned.feedback.recommendationsProse?.[0]?.paragraphs).toEqual([
      "Para.",
    ]);
    // Terse arrays (mobile) still pass through untouched.
    expect(cleaned.feedback.strengths).toEqual(["terse"]);
    // And a valid report validates against the schema.
    expect(Value.Check(ReportSchema, withProse)).toBe(true);
  });

  it("a prose-free report still validates (fields are optional)", () => {
    const noProse = report({});
    expect(Value.Check(ReportSchema, noProse)).toBe(true);
    const cleaned = Value.Clean(
      ReportSchema,
      structuredClone(noProse),
    ) as CoachReport;
    expect(cleaned.feedback.strengthsProse).toBeUndefined();
  });
});

describe("ReportSchema sections field", () => {
  // Same Elysia-stripping guard as the prose fields: report.sections must be
  // declared in ReportSchema or the response clean step deletes it. Covers a
  // section carrying paragraphs, bullets, and timestamped moments.
  it("keeps report.sections (paragraphs, bullets, moments) through the schema", () => {
    const withSections = report({
      sections: [
        {
          title: "Key moments",
          moments: [
            {
              timestamp: "[50:03]",
              detail: "Leader shared a coping mechanism.",
            },
            { detail: "A moment with no timestamp still survives." },
          ],
        },
        {
          title: "Monologue inventory",
          bullets: ["3 stretches over 90s (max 2:40) — all teaching."],
          paragraphs: ["Optional narrative context for the section."],
        },
      ],
    });

    expect(Value.Check(ReportSchema, withSections)).toBe(true);
    const cleaned = Value.Clean(
      ReportSchema,
      structuredClone(withSections),
    ) as CoachReport;

    expect(cleaned.sections?.length).toBe(2);
    expect(cleaned.sections?.[0]).toEqual({
      title: "Key moments",
      moments: [
        { timestamp: "[50:03]", detail: "Leader shared a coping mechanism." },
        { detail: "A moment with no timestamp still survives." },
      ],
    });
    expect(cleaned.sections?.[1]?.bullets).toEqual([
      "3 stretches over 90s (max 2:40) — all teaching.",
    ]);
  });

  it("a report without sections still validates (optional)", () => {
    const noSections = report({});
    expect(Value.Check(ReportSchema, noSections)).toBe(true);
    const cleaned = Value.Clean(
      ReportSchema,
      structuredClone(noSections),
    ) as CoachReport;
    expect(cleaned.sections).toBeUndefined();
  });
});

describe("CoachService admin oversight", () => {
  const service = new CoachService(Database);
  beforeAll(() => seedCoachFixture(Database));
  afterAll(() => clearCoachFixture(Database));

  it("lists every coach with a newest-first latest summary", async () => {
    const leader = (await service.listCoaches()).find((c) => c.id === LEADER);
    expect(leader?.sessionCount).toBe(3);
    const reports = (await service.getReportsById(LEADER)) ?? [];
    const maxDate = reports.reduce((m, r) => (r.date > m ? r.date : m), "");
    expect(leader?.latest?.date).toBe(maxDate);
  });

  it("returns reports for a known coach id and null for an unknown one", async () => {
    expect(await service.getReportsById(LEADER)).not.toBeNull();
    expect(await service.getReportsById("nope")).toBeNull();
    expect(await service.getTrendsById("nope")).toBeNull();
    expect(await service.getProfileById("nope")).toBeNull();
  });

  it("lists only months that actually have reports (newest first)", async () => {
    const monthly = await service.getMonthly(FIXTURE_MONTH);
    expect(monthly.availableMonths).toContain("2033-03");
    expect(monthly.availableMonths).toContain("2033-02");
    expect(monthly.availableMonths).not.toContain("2033-01");
    expect(
      [...monthly.availableMonths].sort((a, b) => (a < b ? 1 : -1)),
    ).toEqual(monthly.availableMonths);
  });

  it("returns a leader's monthly summary (admin drill-in) with picker months", async () => {
    const res = await service.getMonthlySummaryById(LEADER, FIXTURE_MONTH);
    expect(res?.profile.id).toBe(LEADER);
    expect(res?.summary?.month).toBe(FIXTURE_MONTH);
    expect(res?.summary?.clusters.length).toBe(4);
    expect(res?.availableMonths).toEqual(["2033-03", "2033-02"]);
    const empty = await service.getMonthlySummaryById(LEADER, "2030-01");
    expect(empty?.summary).toBeNull();
    expect(empty?.availableMonths).toEqual(["2033-03", "2033-02"]);
    expect(
      await service.getMonthlySummaryById("nope", FIXTURE_MONTH),
    ).toBeNull();
  });

  it("passes through the program narrative for a month that has one", async () => {
    expect((await service.getMonthly(FIXTURE_MONTH)).narrative).toEqual(
      FIXTURE_NARRATIVE,
    );
    expect((await service.getMonthly("2030-01")).narrative).toBeNull();
  });

  it("carries the same availableMonths regardless of which month is queried", async () => {
    const one = await service.getMonthly(FIXTURE_MONTH);
    const empty = await service.getMonthly("2030-01");
    expect(empty.leaders).toHaveLength(0);
    expect(empty.availableMonths).toEqual(one.availableMonths);
  });
});

describe("CoachService recording-link auto-attach", () => {
  const service = new CoachService(Database);
  const conn = Database.getOrCreateConnection();
  const zoom = "https://zoom.us/j/555000111";
  let userId = "";

  beforeAll(async () => {
    await seedCoachFixture(Database);
    await conn.deleteFrom("user").where("email", "=", LEADER_EMAIL).execute();
    userId = (
      await conn
        .insertInto("user")
        .values({ email: LEADER_EMAIL, firstName: "A", lastName: "L" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
  });
  afterAll(async () => {
    await clearCoachFixture(Database);
    await conn.deleteFrom("user").where("email", "=", LEADER_EMAIL).execute();
  });

  it("leaves the recording link empty when the leader has saved no meeting link", async () => {
    const reports = (await service.getReportsById(LEADER)) ?? [];
    expect(reports.length).toBe(3);
    for (const r of reports) expect(r.recordingUrl).toBe("");
  });

  it("auto-attaches the saved meeting link, and an explicit link overrides it", async () => {
    await new CoachRepository(Database).setZoomLink(userId, zoom);
    const [first, ...rest] = (await service.getReportsById(LEADER)) ?? [];
    await new CoachRepository(Database).setRecordingLink(
      LEADER,
      first.id,
      "https://example.org/recordings/session-1",
    );
    const reports = (await service.getReportsById(LEADER)) ?? [];
    expect(reports.find((r) => r.id === first.id)?.recordingUrl).toBe(
      "https://example.org/recordings/session-1",
    );
    for (const r of rest)
      expect(reports.find((x) => x.id === r.id)?.recordingUrl).toBe(zoom);
  });
});

describe("Coach class schemas", () => {
  const validClass = {
    id: "c1",
    name: "Thursday Evening — James",
    classDate: "2026-07-23",
    recurrence: "weekly",
    zoomLink: "https://zoom.us/j/123456789",
    startTime: "19:00",
    timeZone: "America/Chicago",
    notetaker: true,
  };

  it("validates a well-formed class and allows a null date", () => {
    expect(Value.Check(CoachClassSchema, validClass)).toBe(true);
    expect(
      Value.Check(CoachClassSchema, { ...validClass, classDate: null }),
    ).toBe(true);
  });

  it("strips unknown fields on the class response (Elysia clean step)", () => {
    const cleaned = Value.Clean(
      CoachClassSchema,
      structuredClone({ ...validClass, secret: "leak" }),
    ) as Record<string, unknown>;
    expect(cleaned.secret).toBeUndefined();
    expect(cleaned.zoomLink).toBe("https://zoom.us/j/123456789");
  });

  it("carries the resolved leader identity on the admin export row", () => {
    const adminRow = {
      ...validClass,
      leader: { id: "milo-kerr", name: "Milo Kerr", email: "milo@example.com" },
    };
    expect(Value.Check(AdminCoachClassSchema, adminRow)).toBe(true);
    // A class whose owner isn't in the roster still validates (null id).
    expect(
      Value.Check(AdminCoachClassSchema, {
        ...adminRow,
        leader: {
          id: null,
          name: "unknown@example.com",
          email: "unknown@example.com",
        },
      }),
    ).toBe(true);
  });

  it("rejects a class-create body with an unknown recurrence keyword", () => {
    expect(
      Value.Check(CoachClassDto, {
        name: "X",
        classDate: "",
        recurrence: "hourly",
        zoomLink: "",
      }),
    ).toBe(false);
    expect(
      Value.Check(CoachClassDto, {
        name: "X",
        classDate: "",
        recurrence: "weekly",
        zoomLink: "",
      }),
    ).toBe(true);
  });

  it("takes a start time, zone and notetaker choice, and a class without them still validates", () => {
    expect(
      Value.Check(CoachClassDto, {
        name: "X",
        classDate: "2026-10-22",
        recurrence: "weekly",
        zoomLink: "https://zoom.us/j/1",
        startTime: "19:00",
        timeZone: "America/Chicago",
        notetaker: false,
      }),
    ).toBe(true);
    expect(
      Value.Check(CoachClassSchema, {
        ...validClass,
        startTime: null,
        timeZone: null,
      }),
    ).toBe(true);
    expect(
      Value.Check(CoachClassSchema, { ...validClass, notetaker: undefined }),
    ).toBe(false);
  });
});

describe("CoachService.addNote records whether the email went out", () => {
  function noteDb() {
    const saved: Array<Record<string, unknown>> = [];
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "values")
            return (row: Record<string, unknown>) => {
              saved.push(row);
              return builder;
            };
          if (prop === "execute") return async () => [];
          if (prop === "executeTakeFirst") return async () => undefined;
          if (prop === "executeTakeFirstOrThrow")
            return async () => ({
              id: "note",
              ...saved[saved.length - 1],
              created_at: new Date(),
            });
          return () => builder;
        },
      },
    );
    const db = {
      getOrCreateConnection: () => ({
        selectFrom: () => builder,
        insertInto: () => builder,
      }),
    } as unknown as ConstructorParameters<typeof CoachService>[0];
    return { db, saved };
  }

  async function addNoteWith(result: CoachSendResult) {
    const { db, saved } = noteDb();
    const svc = new CoachService(db, {
      sendEmail: async () => result,
    });
    const leader = FIXTURE_LEADERS[0];
    const stub = svc as unknown as {
      resolveById: () => Promise<unknown>;
      getReportDetail: () => Promise<unknown>;
      canonicalReportId: () => Promise<string>;
    };
    stub.resolveById = async () => ({
      ...leader,
      id: leader.slug,
      isCoach: true,
      zoomLink: "",
      reports: [],
    });
    stub.canonicalReportId = async () => FIXTURE_REPORTS[0].report.id;
    stub.getReportDetail = async () => FIXTURE_REPORTS[0].report;
    await svc.addNote(
      leader.slug,
      FIXTURE_REPORTS[0].report.id,
      null,
      "Note body",
    );
    return saved.at(-1)?.emailed;
  }

  it("a delivered send is saved as emailed", async () => {
    expect(await addNoteWith({ delivered: true })).toBe(true);
  });

  it("a refused or failed send is saved as not emailed", async () => {
    expect(
      await addNoteWith({ delivered: false, error: "refused: recipient" }),
    ).toBe(false);
    expect(await addNoteWith({ delivered: false, status: 500 })).toBe(false);
  });
});

describe("CoachService grants coach and admin roles only to a confirmed address", () => {
  const adminEmail = FIXTURE_ADMIN;
  const coachEmail = FIXTURE_LEADERS[0].email;

  function serviceFor(
    user: { email: string; emailVerified: boolean },
    addedLeader?: Record<string, unknown>,
  ) {
    const row = {
      id: "user-1",
      firstName: "Test",
      lastName: "User",
      is_admin: false,
      preferred_language: "en",
      ...user,
    };
    const query: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "execute") return async () => [];
          if (prop === "executeTakeFirst") return async () => addedLeader;
          if (prop === "executeTakeFirstOrThrow") return async () => row;
          return () => query;
        },
      },
    );
    const db = {
      getOrCreateConnection: () => ({
        selectFrom: () => query,
        insertInto: () => query,
      }),
    } as unknown as ConstructorParameters<typeof CoachService>[0];
    return new CoachService(db);
  }

  it("refuses the admin role to an unconfirmed account holding an admin address", async () => {
    const svc = serviceFor({ email: adminEmail, emailVerified: false });
    expect(await svc.isAdmin("user-1")).toBe(false);
    expect(await svc.getMe("user-1")).toBeNull();
  });

  it("refuses the coach role to an unconfirmed account holding a roster address", async () => {
    const svc = serviceFor({ email: coachEmail, emailVerified: false });
    expect(await svc.isCoach("user-1")).toBe(false);
    expect(await svc.getMe("user-1")).toBeNull();
  });
});
