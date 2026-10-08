import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachReviewService, isLegacyReport } from "./coach-review.service";
import { DIMENSIONS } from "./rubric";

const conn = Database.getOrCreateConnection();
const COACH = "review-coach";
const REPORT = "review-report";

async function seed(scoreEach = 4) {
  await conn
    .insertInto("coach_reports")
    .values({
      id: REPORT,
      coach_id: COACH,
      session_date: "2026-08-22",
      source_session_id: "ff-review",
      legacy_ids: [],
      summary: {},
      metrics: {},
      body: {},
    })
    .execute();
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: "ff-review",
      coach_id: COACH,
      title: "s",
      session_date: "2026-08-22",
      state: "scored",
      report_id: REPORT,
    })
    .execute();
  await conn
    .insertInto("coach_report_dimension_scores")
    .values(
      DIMENSIONS.map((d) => ({
        report_id: REPORT,
        dimension_n: d.n,
        score: scoreEach,
        rationale: `machine reason ${d.n}`,
        provenance: "machine",
        model_version: "v3-weighted-100",
      })),
    )
    .execute();
}

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("coach_id", "=", COACH)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

const svc = new CoachReviewService(Database);

describe("an admin can correct a dimension before delivery", () => {
  beforeEach(async () => {
    await clear();
    await seed();
  });
  afterEach(clear);

  it("shows every dimension with where its number came from", async () => {
    const state = await svc.review(REPORT);
    expect(state?.dimensions.length).toBe(12);
    expect(state?.dimensions.every((d) => d.provenance === "machine")).toBe(
      true,
    );
    expect(state?.humanCorrected).toBe(false);
    expect(state?.base).toBeCloseTo(80, 6);
  });

  it("a correction recomputes the composite from the corrected set", async () => {
    const before = await svc.review(REPORT);
    const result = await svc.correct({
      reportId: REPORT,
      dimensionN: 1,
      score: 2,
      rationale: "the blueprint was not followed",
      correctedByUserId: null,
    });

    expect(result.ok).toBe(true);
    // Not patched by a delta, recomputed, so the composite always equals what
    // its dimensions say.
    expect(result.base).toBeLessThan(before?.base as number);
    const after = await svc.review(REPORT);
    expect(after?.base).toBeCloseTo(result.base as number, 6);
  });

  it("records WHO corrected it, not just that someone did", async () => {
    // Every other test here passes correctedByUserId: null, so the audit
    // column was never written by anything and a regression dropping it from
    // the update would have gone unnoticed. It is the only record of which
    // admin changed a leader's score.
    const admin = await conn
      .insertInto("user")
      .values({
        email: `review-admin-${Date.now()}@test.local`,
        firstName: "Review",
        lastName: "Admin",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    try {
      const result = await svc.correct({
        reportId: REPORT,
        dimensionN: 3,
        score: 2,
        rationale: "corrected by a person",
        correctedByUserId: admin.id,
      });
      expect(result.ok).toBe(true);

      const row = await conn
        .selectFrom("coach_report_dimension_scores")
        .select(["corrected_by", "provenance"])
        .where("report_id", "=", REPORT)
        .where("dimension_n", "=", 3)
        .executeTakeFirstOrThrow();
      expect(row.corrected_by).toBe(admin.id);
      expect(row.provenance).toBe("human");

      // The dimensions nobody touched carry no attribution.
      const untouched = await conn
        .selectFrom("coach_report_dimension_scores")
        .select("corrected_by")
        .where("report_id", "=", REPORT)
        .where("dimension_n", "=", 4)
        .executeTakeFirstOrThrow();
      expect(untouched.corrected_by).toBeNull();
    } finally {
      await conn.deleteFrom("user").where("id", "=", admin.id).execute();
    }
  });

  it("the corrected dimension is marked human, and the rest stay machine", async () => {
    await svc.correct({
      reportId: REPORT,
      dimensionN: 1,
      score: 2,
      rationale: "corrected",
      correctedByUserId: null,
    });
    const state = await svc.review(REPORT);
    expect(state?.humanCorrected).toBe(true);
    expect(state?.dimensions.find((d) => d.n === 1)?.provenance).toBe("human");
    expect(
      state?.dimensions
        .filter((d) => d.n !== 1)
        .every((d) => d.provenance === "machine"),
    ).toBe(true);
  });

  it("a dimension can be corrected to NOT APPLICABLE", async () => {
    const result = await svc.correct({
      reportId: REPORT,
      dimensionN: 2,
      score: null,
      rationale: "there were no newcomers",
      correctedByUserId: null,
    });
    expect(result.ok).toBe(true);
    const state = await svc.review(REPORT);
    expect(state?.dimensions.find((d) => d.n === 2)?.score).toBeNull();
  });

  it("a report nobody corrects is delivered as MACHINE-scored, review is not required", async () => {
    // Making review mandatory would put a human back in the loop the port
    // exists to remove.
    const state = await svc.review(REPORT);
    expect(state?.humanCorrected).toBe(false);
    expect(state?.dimensions.every((d) => d.provenance === "machine")).toBe(
      true,
    );
  });

  it("an out-of-range correction is refused", async () => {
    const result = await svc.correct({
      reportId: REPORT,
      dimensionN: 1,
      score: 9,
      rationale: "x",
      correctedByUserId: null,
    });
    expect(result.ok).toBe(false);
    expect(result.refusal).toBe("score-out-of-range");
  });

  it("a DELIVERED report cannot be corrected", async () => {
    // The leader has already read it; changing it quietly means two people
    // discussing different reports with the same id.
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivered" })
      .where("report_id", "=", REPORT)
      .execute();

    const result = await svc.correct({
      reportId: REPORT,
      dimensionN: 1,
      score: 2,
      rationale: "too late",
      correctedByUserId: null,
    });
    expect(result.ok).toBe(false);
    expect(result.refusal).toBe("already-delivered");
    const state = await svc.review(REPORT);
    expect(state?.dimensions.find((d) => d.n === 1)?.score).toBe(4);
  });

  for (const state of ["delivering", "retained"]) {
    it(`a correction while the session is ${state} is refused and changes nothing`, async () => {
      await conn
        .updateTable("coach_intake_sessions")
        .set({ state })
        .where("report_id", "=", REPORT)
        .execute();
      const corrected = await svc.correct({
        reportId: REPORT,
        dimensionN: 1,
        score: 2,
        rationale: "mid-delivery",
        correctedByUserId: null,
      });
      expect(corrected).toEqual({ ok: false, refusal: "in-flight" });
      const flagged = await svc.setFirstLesson({
        reportId: REPORT,
        firstLesson: true,
        byUserId: null,
      });
      expect(flagged).toEqual({ ok: false, refusal: "in-flight" });
      const after = await svc.review(REPORT);
      expect(after?.dimensions.find((d) => d.n === 1)?.score).toBe(4);
      expect(after?.dimensions.find((d) => d.n === 9)?.score).toBe(4);
      expect(after?.firstLesson).toBe(false);
    });
  }

  it("a correction waits for a delivery claim taken at the same moment, then refuses", async () => {
    let pending: Promise<unknown> | undefined;
    await conn.transaction().execute(async (trx) => {
      await trx
        .updateTable("coach_intake_sessions")
        .set({ state: "delivering" })
        .where("report_id", "=", REPORT)
        .execute();
      pending = svc.correct({
        reportId: REPORT,
        dimensionN: 1,
        score: 2,
        rationale: "raced the claim",
        correctedByUserId: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(await pending).toEqual({ ok: false, refusal: "in-flight" });
    const after = await svc.review(REPORT);
    expect(after?.dimensions.find((d) => d.n === 1)?.score).toBe(4);
  });

  for (const state of ["delivery_pending", "delivery_failed"]) {
    it(`a report whose delivery is ${state} can still be corrected`, async () => {
      await conn
        .updateTable("coach_intake_sessions")
        .set({ state })
        .where("report_id", "=", REPORT)
        .execute();
      const corrected = await svc.correct({
        reportId: REPORT,
        dimensionN: 1,
        score: 2,
        rationale: "before the retry",
        correctedByUserId: null,
      });
      expect(corrected.ok).toBe(true);
    });
  }

  for (const state of ["delivery_pending", "delivery_failed"]) {
    it(`a report already emailed to its leader while ${state} is refused a correction and the first-lesson flag, and changes nothing`, async () => {
      await conn
        .updateTable("coach_intake_sessions")
        .set({ state, delivered_to: ["leader@example.test"] })
        .where("report_id", "=", REPORT)
        .execute();
      const corrected = await svc.correct({
        reportId: REPORT,
        dimensionN: 1,
        score: 1,
        rationale: "after the leader read it",
        correctedByUserId: null,
      });
      expect(corrected).toEqual({ ok: false, refusal: "partially-delivered" });
      const flagged = await svc.setFirstLesson({
        reportId: REPORT,
        firstLesson: true,
        byUserId: null,
      });
      expect(flagged).toEqual({ ok: false, refusal: "partially-delivered" });
      const after = await svc.review(REPORT);
      expect(after?.dimensions.find((d) => d.n === 1)?.score).toBe(4);
      expect(after?.dimensions.find((d) => d.n === 9)?.score).toBe(4);
      expect(after?.firstLesson).toBe(false);
    });
  }

  it("an unknown dimension is refused", async () => {
    const result = await svc.correct({
      reportId: REPORT,
      dimensionN: 99,
      score: 3,
      rationale: "nope",
      correctedByUserId: null,
    });
    expect(result.ok).toBe(false);
    expect(result.refusal).toBe("unknown-dimension");
  });

  it("an unknown report is refused", async () => {
    expect(await svc.review("no-such-report")).toBeNull();
    const result = await svc.correct({
      reportId: "no-such-report",
      dimensionN: 1,
      score: 3,
      rationale: "nope",
      correctedByUserId: null,
    });
    expect(result.ok).toBe(false);
    expect(result.refusal).toBe("unknown-report");
  });
});

describe("Legacy Reports Are Read-Only", () => {
  const LEGACY = "review-legacy-report";
  const metrics = {
    base: 80,
    newcomerBonus: 0,
    sizeBonus: 0,
    dimensions: [{ n: 3, score: 4, note: "hand scored" }],
  };

  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_reports")
      .values({
        id: LEGACY,
        coach_id: COACH,
        session_date: "2026-08-15",
        source_session_id: `legacy:${COACH}:2026-08-15`,
        legacy_ids: [],
        summary: { score: 80, status: "Strong" },
        metrics: JSON.stringify(metrics),
        body: {},
      })
      .execute();
    await conn
      .insertInto("coach_report_dimension_scores")
      .values({
        report_id: LEGACY,
        dimension_n: 3,
        score: 4,
        rationale: "hand scored",
        provenance: "machine",
        model_version: "v3-weighted-100",
      })
      .execute();
  });
  afterEach(clear);

  it("An admin tries to amend a legacy report: the correction is refused as a legacy report and nothing changes", async () => {
    const result = await svc.correct({
      reportId: LEGACY,
      dimensionN: 3,
      score: 2,
      rationale: "too generous",
      correctedByUserId: null,
    });
    expect(result).toEqual({ ok: false, refusal: "legacy-report" });

    const dimension = await conn
      .selectFrom("coach_report_dimension_scores")
      .select(["score", "provenance"])
      .where("report_id", "=", LEGACY)
      .executeTakeFirstOrThrow();
    expect(dimension).toEqual({ score: 4, provenance: "machine" });
    const report = await conn
      .selectFrom("coach_reports")
      .select(["summary", "metrics"])
      .where("id", "=", LEGACY)
      .executeTakeFirstOrThrow();
    expect(report.summary).toEqual({ score: 80, status: "Strong" });
    expect(report.metrics).toEqual(metrics);
  });

  it("the guard the flag and amendment paths call names legacy reports only", async () => {
    await seed();
    expect(await isLegacyReport(Database, LEGACY)).toBe(true);
    expect(await isLegacyReport(Database, REPORT)).toBe(false);
    expect(await isLegacyReport(Database, "no-such-report")).toBe(false);
  });
});

describe("an admin edits an undelivered report's improvements", () => {
  const ADMIN_EMAIL = "review-edit-admin@test.local";
  let admin = "";
  const COLD = "Open with a cold recall of last week's big ideas";

  beforeEach(async () => {
    await clear();
    await seed();
    await conn.deleteFrom("user").where("email", "=", ADMIN_EMAIL).execute();
    admin = (
      await conn
        .insertInto("user")
        .values({ email: ADMIN_EMAIL, firstName: "E", lastName: "A" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    await conn
      .updateTable("coach_reports")
      .set({
        first_lesson: true,
        body: JSON.stringify({
          feedback: {
            headline: "new study",
            improvements: [COLD],
            improvementsProse: [
              {
                title: "No recap",
                paragraphs: ["Reserve a cold-recall drill."],
              },
            ],
          },
        }),
      })
      .where("id", "=", REPORT)
      .execute();
  });
  afterEach(async () => {
    await clear();
    await conn.deleteFrom("user").where("email", "=", ADMIN_EMAIL).execute();
  });

  async function feedback() {
    const row = await conn
      .selectFrom("coach_reports")
      .select("body")
      .where("id", "=", REPORT)
      .executeTakeFirstOrThrow();
    return (row.body as { feedback: Record<string, unknown> }).feedback;
  }

  it("the admin replaces a first lesson's cold-recall improvement, bullets and prose together, and the edit is recorded with who and when", async () => {
    const prose = [
      { title: "Quiet members", paragraphs: ["Ask the quiet ones first."] },
    ];
    expect(
      await svc.editImprovements({
        reportId: REPORT,
        improvements: ["Call on quiet members"],
        improvementsProse: prose,
        byUserId: admin,
      }),
    ).toEqual({ ok: true });
    expect(await feedback()).toEqual({
      headline: "new study",
      improvements: ["Call on quiet members"],
      improvementsProse: prose,
    });
    const edits = await conn
      .selectFrom("coach_report_edits")
      .select(["edited_by", "edited_at", "changes"])
      .where("report_id", "=", REPORT)
      .execute();
    expect(edits).toHaveLength(1);
    expect(edits[0].edited_by).toBe(admin);
    expect(edits[0].edited_at).toBeInstanceOf(Date);
    expect(edits[0].changes).toMatchObject({
      improvements: { from: [COLD], to: ["Call on quiet members"] },
    });
  });

  it("bullets edited without prose clear the old prose, so it cannot keep the cold recall", async () => {
    expect(
      await svc.editImprovements({
        reportId: REPORT,
        improvements: ["Call on quiet members"],
        byUserId: admin,
      }),
    ).toEqual({ ok: true });
    expect(await feedback()).toEqual({
      headline: "new study",
      improvements: ["Call on quiet members"],
    });
  });

  it("a replacement that still asks a first lesson for a cold recall is refused and changes nothing", async () => {
    const result = await svc.editImprovements({
      reportId: REPORT,
      improvements: ["Start with a cold recall drill"],
      byUserId: admin,
    });
    expect(result.ok).toBe(false);
    expect(result.refusal).toBe("cold-recall-improvement");
    expect(result.coldRecall?.length).toBeGreaterThan(0);
    expect((await feedback()).improvements).toEqual([COLD]);
  });

  it.each([
    [{ state: "delivered" }, "already-delivered"],
    [
      { state: "delivery_pending", delivered_to: ["leader@example.test"] },
      "partially-delivered",
    ],
    [{ state: "delivering" }, "in-flight"],
  ])(
    "a session %p is refused as %s and nothing changes",
    async (set, refusal) => {
      await conn
        .updateTable("coach_intake_sessions")
        .set(set)
        .where("report_id", "=", REPORT)
        .execute();
      const result: unknown = await svc.editImprovements({
        reportId: REPORT,
        improvements: ["Call on quiet members"],
        byUserId: admin,
      });
      expect(result).toEqual({ ok: false, refusal });
      expect((await feedback()).improvements).toEqual([COLD]);
    },
  );

  it("a legacy report is refused", async () => {
    await conn
      .updateTable("coach_reports")
      .set({ source_session_id: "legacy:review-coach:2026-08-22" })
      .where("id", "=", REPORT)
      .execute();
    expect(
      await svc.editImprovements({
        reportId: REPORT,
        improvements: ["Call on quiet members"],
        byUserId: admin,
      }),
    ).toEqual({ ok: false, refusal: "legacy-report" });
  });
});
