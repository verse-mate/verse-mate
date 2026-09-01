import { describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { Elysia } from "elysia";

import coachPlugin from "./coach.plugin";
import { CoachReportsRepository } from "./repository/coach-reports.repository";

const repo = new CoachReportsRepository(Database);
const app = new Elysia().use(coachPlugin);

/**
 * Pagination inputs arrive as strings. `Number("abc")` is NaN, and NaN survives
 * `Math.min(Math.max(n, 1), 100)` unchanged, so it reached SQL as `LIMIT NaN`
 * and came back as `invalid input syntax for type bigint: "NaN"` — a 500 for
 * what is a malformed client request, with an internal detail in the body.
 *
 * Guarded in two places on purpose: the repository clamp is the root fix every
 * caller routes through, the route schema is what turns a bad request into a
 * client error instead of an exception.
 */
describe("pagination inputs cannot reach SQL malformed", () => {
  for (const [label, opts] of [
    ["NaN limit", { limit: Number("abc") }],
    ["NaN offset", { offset: Number("abc") }],
    ["zero limit", { limit: 0 }],
    ["oversized limit", { limit: 100_000 }],
    ["negative offset", { offset: -5 }],
    ["fractional limit", { limit: 2.7 }],
  ] as const) {
    it(`the repository clamps a ${label} instead of failing in the database`, async () => {
      const rows = await repo.listSummaries("no-such-coach", opts);
      expect(Array.isArray(rows)).toBe(true);
    });
  }

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
