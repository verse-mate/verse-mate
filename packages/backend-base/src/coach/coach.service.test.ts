import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
  AdminCoachClassSchema,
  CoachClassSchema,
  ReportSchema,
} from "./coach.schema";
import { type CoachReport, CoachService } from "./coach.service";
import { CoachClassDto } from "./dto/coach.dto";

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
  // listCoaches / getReportsById now merge admin-added leaders and overlay
  // recording links + notes from the DB. A fully-chainable query-builder stub
  // that resolves every terminal to [] means "no added leaders, no overlays",
  // so the assertions below reflect the bundled dataset unchanged.
  const emptyQuery: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "execute") return async () => [];
        if (prop === "executeTakeFirst") return async () => undefined;
        return () => emptyQuery;
      },
    },
  );
  const stubDb = {
    getOrCreateConnection: () => ({
      selectFrom: () => emptyQuery,
      insertInto: () => emptyQuery,
    }),
  } as unknown as ConstructorParameters<typeof CoachService>[0];
  const adminSvc = new CoachService(stubDb);

  it("lists every coach with a newest-first latest summary", async () => {
    const coaches = await adminSvc.listCoaches();
    expect(coaches.length).toBeGreaterThan(0);
    const jeff = coaches.find((c) => c.id === "jeff-ward");
    expect(jeff).toBeDefined();
    expect(jeff?.sessionCount).toBeGreaterThanOrEqual(1);
    // latest.date must be >= every other report date for that coach.
    const reports = (await adminSvc.getReportsById("jeff-ward")) ?? [];
    const maxDate = reports.reduce((m, r) => (r.date > m ? r.date : m), "");
    expect(jeff?.latest?.date).toBe(maxDate);
  });

  it("returns reports for a known coach id and null for an unknown one", async () => {
    expect(await adminSvc.getReportsById("jeff-ward")).not.toBeNull();
    expect(await adminSvc.getReportsById("nope")).toBeNull();
    expect(await adminSvc.getTrendsById("nope")).toBeNull();
    expect(await adminSvc.getProfileById("nope")).toBeNull();
  });

  it("lists only months that actually have reports (newest first)", async () => {
    const monthly = await adminSvc.getMonthly("2026-07");
    // Every listed month must be present in the underlying dataset — a month
    // with no reports must never appear in the picker.
    const reportMonths = new Set<string>();
    for (const c of await adminSvc.listCoaches()) {
      const reps = (await adminSvc.getReportsById(c.id)) ?? [];
      for (const r of reps) reportMonths.add(r.date.slice(0, 7));
    }
    expect(monthly.availableMonths.length).toBeGreaterThan(0);
    for (const m of monthly.availableMonths)
      expect(reportMonths.has(m)).toBe(true);
    expect(
      [...monthly.availableMonths].sort((a, b) => (a < b ? 1 : -1)),
    ).toEqual(monthly.availableMonths);
    // A month the dataset never covers is absent.
    expect(monthly.availableMonths).not.toContain("2025-12");
  });

  it("carries the same availableMonths regardless of which month is queried", async () => {
    const jul = await adminSvc.getMonthly("2026-07");
    const jan = await adminSvc.getMonthly("2026-01");
    expect(jan.availableMonths).toEqual(jul.availableMonths);
    // An empty month still reports zero leaders but the full picker list.
    const empty = await adminSvc.getMonthly("2030-01");
    expect(empty.leaders).toHaveLength(0);
    expect(empty.availableMonths).toEqual(jul.availableMonths);
  });
});

describe("CoachService recording-link auto-attach", () => {
  // A table-aware query stub: coach_zoom_links terminal → the saved meeting
  // link; coach_recording_links terminal → the seeded explicit links; all
  // other terminals → empty.
  function stubDbFor(opts: {
    zoomLink?: string;
    recordingLinks?: Record<string, string>;
  }) {
    const recordingRows = Object.entries(opts.recordingLinks ?? {}).map(
      ([report_id, recording_url]) => ({ report_id, recording_url }),
    );
    const builderFor = (table: string) => {
      const b: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "execute")
              return async () =>
                table === "coach_recording_links" ? recordingRows : [];
            if (prop === "executeTakeFirst")
              return async () =>
                table === "coach_zoom_links" && opts.zoomLink
                  ? { zoom_link: opts.zoomLink }
                  : undefined;
            return () => b;
          },
        },
      );
      return b;
    };
    return {
      getOrCreateConnection: () => ({
        selectFrom: (table: string) => builderFor(table),
        insertInto: () => builderFor("_"),
      }),
    } as unknown as ConstructorParameters<typeof CoachService>[0];
  }

  it("auto-attaches the leader's saved meeting link when no explicit link is set", async () => {
    const zoom = "https://zoom.us/j/555000111";
    const svc = new CoachService(stubDbFor({ zoomLink: zoom }));
    const reports = (await svc.getReportsById("jeff-ward")) ?? [];
    expect(reports.length).toBeGreaterThan(0);
    for (const r of reports) expect(r.recordingUrl).toBe(zoom);
  });

  it("lets an explicit recording link override the auto-attached meeting link", async () => {
    const zoom = "https://zoom.us/j/555000111";
    const explicit = "https://drive.google.com/file/session-1";
    // Grab a real report id first, then seed an explicit link for it.
    const ids =
      (await new CoachService(stubDbFor({})).getReportsById("jeff-ward")) ?? [];
    const targetId = ids[0]?.id ?? "";
    const svc = new CoachService(
      stubDbFor({ zoomLink: zoom, recordingLinks: { [targetId]: explicit } }),
    );
    const reports = (await svc.getReportsById("jeff-ward")) ?? [];
    expect(reports.find((r) => r.id === targetId)?.recordingUrl).toBe(explicit);
    // Every other session still gets the auto-attached meeting link.
    for (const r of reports.filter((r) => r.id !== targetId)) {
      expect(r.recordingUrl).toBe(zoom);
    }
  });

  it("leaves the recording link empty when the leader has saved no meeting link", async () => {
    const svc = new CoachService(stubDbFor({}));
    const reports = (await svc.getReportsById("jeff-ward")) ?? [];
    for (const r of reports) expect(r.recordingUrl).toBe("");
  });
});

describe("Coach class schemas", () => {
  const validClass = {
    id: "c1",
    name: "Thursday Evening — James",
    classDate: "2026-07-23",
    recurrence: "weekly",
    zoomLink: "https://zoom.us/j/123456789",
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
      leader: { id: "jeff-ward", name: "Jeff Ward", email: "jeff@example.com" },
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
});
