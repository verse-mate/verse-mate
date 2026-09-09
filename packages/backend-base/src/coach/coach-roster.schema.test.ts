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

describe("the leader roster lives in coach_leaders", () => {
  it("carries the slug the reports key on, plus the bundle's roster fields", async () => {
    const cols = await columns("coach_leaders");
    // `slug` is the join to coach_reports.coach_id, the roster is unusable
    // from the database without it, because every report keys on the slug.
    for (const c of [
      "slug",
      "email",
      "name",
      "group_name",
      "coach_name",
      "is_coach",
      "zoom_link",
      "is_benchmark",
    ]) {
      expect(cols.has(c)).toBe(true);
    }
  });

  it("marks the benchmark leader, whom governance rule 1 is unimplementable without", async () => {
    await sql`
      INSERT INTO coach_leaders (slug, email, name, is_benchmark)
      VALUES ('bench-probe', 'bench-probe@example.test', 'Probe', true)
      ON CONFLICT (email) DO UPDATE SET is_benchmark = true
    `.execute(conn);
    const row = await conn
      .selectFrom("coach_leaders")
      .select(["slug", "is_benchmark"])
      .where("email", "=", "bench-probe@example.test")
      .executeTakeFirstOrThrow();
    expect(row.is_benchmark).toBe(true);
    expect(row.slug).toBe("bench-probe");
    await conn
      .deleteFrom("coach_leaders")
      .where("email", "=", "bench-probe@example.test")
      .execute();
  });

  it("at most one leader can be the benchmark", async () => {
    await sql`
      INSERT INTO coach_leaders (slug, email, name, is_benchmark)
      VALUES ('bench-a', 'bench-a@example.test', 'A', true)
    `.execute(conn);
    await expect(
      sql`
        INSERT INTO coach_leaders (slug, email, name, is_benchmark)
        VALUES ('bench-b', 'bench-b@example.test', 'B', true)
      `.execute(conn),
    ).rejects.toThrow();
    await conn
      .deleteFrom("coach_leaders")
      .where("email", "in", ["bench-a@example.test", "bench-b@example.test"])
      .execute();
  });

  it("slug is unique, two leaders cannot share the key reports join on", async () => {
    await sql`
      INSERT INTO coach_leaders (slug, email, name)
      VALUES ('dup-slug', 'dup-1@example.test', 'One')
    `.execute(conn);
    await expect(
      sql`
        INSERT INTO coach_leaders (slug, email, name)
        VALUES ('dup-slug', 'dup-2@example.test', 'Two')
      `.execute(conn),
    ).rejects.toThrow();
    await conn
      .deleteFrom("coach_leaders")
      .where("email", "in", ["dup-1@example.test", "dup-2@example.test"])
      .execute();
  });
});
