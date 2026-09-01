import { afterEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

const conn = Database.getOrCreateConnection();
const COACH = "provenance-probe";

async function seedReport(id: string) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: COACH,
      session_date: "2026-08-01",
      source_session_id: `src-${id}`,
      legacy_ids: [],
      summary: {},
      metrics: {},
      body: {},
    })
    .execute();
}

async function cleanup() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

describe("every dimension score carries its provenance", () => {
  afterEach(cleanup);

  it("records machine vs human per dimension, with the model version", async () => {
    await seedReport("prov-1");
    await conn
      .insertInto("coach_report_dimension_scores")
      .values([
        {
          report_id: "prov-1",
          dimension_n: 1,
          score: 4,
          rationale: "machine said so",
          provenance: "machine",
          model_version: "v3-weighted-100",
        },
        {
          report_id: "prov-1",
          dimension_n: 2,
          score: 5,
          rationale: "admin corrected",
          provenance: "human",
          model_version: "v3-weighted-100",
        },
      ])
      .execute();

    const rows = await conn
      .selectFrom("coach_report_dimension_scores")
      .selectAll()
      .where("report_id", "=", "prov-1")
      .orderBy("dimension_n")
      .execute();
    expect(rows.map((r) => r.provenance)).toEqual(["machine", "human"]);
    expect(rows[0].model_version).toBe("v3-weighted-100");
  });

  it("provenance is constrained — an unknown value cannot be stored", async () => {
    await seedReport("prov-2");
    await expect(
      sql`
        INSERT INTO coach_report_dimension_scores
          (report_id, dimension_n, provenance)
        VALUES ('prov-2', 1, 'guessed')
      `.execute(conn),
    ).rejects.toThrow();
  });

  it("a not-applicable dimension is a NULL score, not a low one", async () => {
    await seedReport("prov-3");
    await conn
      .insertInto("coach_report_dimension_scores")
      .values({
        report_id: "prov-3",
        dimension_n: 2,
        score: null,
        rationale: "no newcomers present",
        provenance: "machine",
      })
      .execute();
    const row = await conn
      .selectFrom("coach_report_dimension_scores")
      .selectAll()
      .where("report_id", "=", "prov-3")
      .executeTakeFirstOrThrow();
    expect(row.score).toBeNull();
  });

  it("a score outside 1-5 is refused", async () => {
    await seedReport("prov-4");
    await expect(
      sql`
        INSERT INTO coach_report_dimension_scores
          (report_id, dimension_n, score, provenance)
        VALUES ('prov-4', 1, 9, 'machine')
      `.execute(conn),
    ).rejects.toThrow();
  });

  it("one row per report+dimension, and it disappears with its report", async () => {
    await seedReport("prov-5");
    await conn
      .insertInto("coach_report_dimension_scores")
      .values({ report_id: "prov-5", dimension_n: 1, provenance: "machine" })
      .execute();
    await expect(
      conn
        .insertInto("coach_report_dimension_scores")
        .values({ report_id: "prov-5", dimension_n: 1, provenance: "machine" })
        .execute(),
    ).rejects.toThrow();

    await cleanup();
    const orphans = await conn
      .selectFrom("coach_report_dimension_scores")
      .select("report_id")
      .where("report_id", "=", "prov-5")
      .execute();
    expect(orphans.length).toBe(0);
  });
});
