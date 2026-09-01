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

describe("coach report store schema", () => {
  it("coach_reports carries the immutable id, the natural key and the three payloads", async () => {
    const cols = await columns("coach_reports");
    for (const c of [
      "id",
      "coach_id",
      "session_date",
      "legacy_ids",
      "summary",
      "metrics",
      "body",
    ]) {
      expect(cols.has(c)).toBe(true);
    }
  });

  it("coach_dataset_meta.version cannot decrease — the guard is in the schema, not app code", async () => {
    await sql`
      INSERT INTO coach_dataset_meta (id, version, report_count)
      VALUES (true, 10, 1)
      ON CONFLICT (id) DO UPDATE SET version = 10, report_count = 1
    `.execute(conn);

    await expect(
      sql`UPDATE coach_dataset_meta SET version = 9 WHERE id = true`.execute(
        conn,
      ),
    ).rejects.toThrow(/cannot decrease/);

    // …and advancing is still allowed.
    await sql`UPDATE coach_dataset_meta SET version = 11 WHERE id = true`.execute(
      conn,
    );
    await sql`DELETE FROM coach_dataset_meta WHERE id = true`.execute(conn);
  });
});
