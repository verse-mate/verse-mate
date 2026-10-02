import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { Elysia } from "elysia";

import coachPlugin from "./coach.plugin";
import { CoachReportsRepository } from "./repository/coach-reports.repository";

const repo = new CoachReportsRepository(Database);
const app = new Elysia().use(coachPlugin);

/**
 * Pagination inputs arrive as strings. `Number("abc")` is NaN, and NaN survives
 * `Math.min(Math.max(n, 1), 100)` unchanged, so it reached SQL as `LIMIT NaN`
 * and came back as `invalid input syntax for type bigint: "NaN"`, a 500 for
 * what is a malformed client request, with an internal detail in the body.
 *
 * Guarded in two places on purpose: the repository clamp is the root fix every
 * caller routes through, the route schema is what turns a bad request into a
 * client error instead of an exception.
 */
const PAGING_COACH = "paging-coach";
const conn = Database.getOrCreateConnection();

/** 101 reports, one more than the maximum page, so the cap is observable. */
async function seedPages() {
  await conn
    .insertInto("coach_reports")
    .values(
      Array.from({ length: 101 }, (_, i) => ({
        id: `${PAGING_COACH}-r${i}`,
        coach_id: PAGING_COACH,
        // Distinct dates, so the ordering is total and a page is stable.
        session_date: new Date(2026, 0, 1 + i).toISOString().slice(0, 10),
        source_session_id: `ff-paging-${i}`,
        legacy_ids: [],
        summary: { session: `Session ${i}`, score: 70, status: "Strong" },
        metrics: {},
        body: {},
      })),
    )
    .execute();
}

beforeAll(async () => {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", PAGING_COACH)
    .execute();
  await seedPages();
});

afterAll(async () => {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", PAGING_COACH)
    .execute();
});

describe("pagination inputs cannot reach SQL malformed", () => {
  // Asserted against real rows. Checking only that an array came back proved
  // the query did not throw and nothing about what the clamp actually did, so
  // a clamp that let 100_000 through would have passed.
  for (const [label, opts, expected] of [
    ["NaN limit", { limit: Number("abc") }, 25],
    ["NaN offset", { offset: Number("abc") }, 25],
    ["zero limit", { limit: 0 }, 1],
    ["oversized limit", { limit: 100_000 }, 100],
    ["negative offset", { offset: -5 }, 25],
    ["fractional limit", { limit: 2.7 }, 2],
  ] as const) {
    it(`clamps a ${label} to ${expected} rows`, async () => {
      const rows = await repo.listSummaries(PAGING_COACH, opts);
      expect(rows.length).toBe(expected);
    });
  }

  it("a negative offset reads the FIRST page, not a shifted one", async () => {
    const first = await repo.listSummaries(PAGING_COACH, { limit: 3 });
    const negative = await repo.listSummaries(PAGING_COACH, {
      limit: 3,
      offset: -5,
    });
    expect(negative.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });

  for (const q of ["limit=abc", "offset=abc", "limit=-1"]) {
    it(`?${q} is a client error carrying no database detail`, async () => {
      const res = await app.handle(
        new Request(`http://localhost/coach/reports/summary?${q}`),
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(await res.text()).not.toMatch(
        /invalid input syntax|syntax error|bigint/i,
      );
    });
  }

  it("a well-formed page request gets past validation to the auth check", async () => {
    const res = await app.handle(
      new Request("http://localhost/coach/reports/summary?limit=10&offset=0"),
    );
    expect(res.status).toBe(401);
  });
});
