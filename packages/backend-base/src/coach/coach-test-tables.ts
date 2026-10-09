import { afterAll, beforeAll } from "bun:test";
import { db as Database } from "database";

type SharedTable =
  | "coach_dataset_meta"
  | "coach_admins"
  | "coach_monthly_reports";

export function isolateTable(table: SharedTable): void {
  const conn = Database.getOrCreateConnection();
  let kept: Record<string, unknown>[] = [];
  beforeAll(async () => {
    kept = await conn.selectFrom(table).selectAll().execute();
    await conn.deleteFrom(table).execute();
  });
  afterAll(async () => {
    await conn.deleteFrom(table).execute();
    if (kept.length > 0)
      await conn
        .insertInto(table)
        .values(kept as never)
        .execute();
  });
}
