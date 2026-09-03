import { describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

const conn = Database.getOrCreateConnection();

async function columns(table: string): Promise<Set<string>> {
  const rows = await sql<{
    column_name: string;
  }>`SELECT column_name FROM information_schema.columns WHERE table_name = ${table}`.execute(
    conn,
  );
  return new Set(rows.rows.map((r) => r.column_name));
}

describe("the monthly structures live in the database", () => {
  it("coach_monthly_narratives is keyed by month and carries the program narrative", async () => {
    const cols = await columns("coach_monthly_narratives");
    for (const c of ["month", "executive_summary", "trends", "updated_at"]) {
      expect(cols.has(c)).toBe(true);
    }
  });

  it("one narrative per month, a re-publish updates rather than duplicating", async () => {
    await sql`
      INSERT INTO coach_monthly_narratives (month, executive_summary, trends)
      VALUES ('1999-01', '["a"]'::jsonb, '["b"]'::jsonb)
    `.execute(conn);
    await expect(
      sql`
        INSERT INTO coach_monthly_narratives (month, executive_summary, trends)
        VALUES ('1999-01', '["c"]'::jsonb, '["d"]'::jsonb)
      `.execute(conn),
    ).rejects.toThrow();
    await conn
      .deleteFrom("coach_monthly_narratives")
      .where("month", "=", "1999-01")
      .execute();
  });

  it("coach_monthly_leader_summaries is keyed by leader AND month", async () => {
    const cols = await columns("coach_monthly_leader_summaries");
    for (const c of ["coach_id", "month", "summary", "updated_at"]) {
      expect(cols.has(c)).toBe(true);
    }
    await sql`
      INSERT INTO coach_monthly_leader_summaries (coach_id, month, summary)
      VALUES ('probe-leader', '1999-01', '{"composite":80}'::jsonb)
    `.execute(conn);
    // same leader, different month, allowed
    await sql`
      INSERT INTO coach_monthly_leader_summaries (coach_id, month, summary)
      VALUES ('probe-leader', '1999-02', '{"composite":81}'::jsonb)
    `.execute(conn);
    // same leader AND month, refused
    await expect(
      sql`
        INSERT INTO coach_monthly_leader_summaries (coach_id, month, summary)
        VALUES ('probe-leader', '1999-01', '{"composite":99}'::jsonb)
      `.execute(conn),
    ).rejects.toThrow();
    await conn
      .deleteFrom("coach_monthly_leader_summaries")
      .where("coach_id", "=", "probe-leader")
      .execute();
  });
});
