import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachReviewService } from "./coach-review.service";
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
    // Not patched by a delta — recomputed, so the composite always equals what
    // its dimensions say.
    expect(result.base).toBeLessThan(before?.base as number);
    const after = await svc.review(REPORT);
    expect(after?.base).toBeCloseTo(result.base as number, 6);
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

  it("a report nobody corrects is delivered as MACHINE-scored — review is not required", async () => {
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
