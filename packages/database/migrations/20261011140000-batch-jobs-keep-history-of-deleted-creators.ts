import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await sql`ALTER TABLE batch_jobs ALTER COLUMN created_by DROP NOT NULL`.execute(
    db,
  );
  await sql`ALTER TABLE batch_jobs DROP CONSTRAINT batch_jobs_created_by_fkey`.execute(
    db,
  );
  await sql`
    ALTER TABLE batch_jobs ADD CONSTRAINT batch_jobs_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await sql`ALTER TABLE batch_jobs DROP CONSTRAINT batch_jobs_created_by_fkey`.execute(
    db,
  );
  await sql`
    ALTER TABLE batch_jobs ADD CONSTRAINT batch_jobs_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES "user"(id)
  `.execute(db);
  const { rows } = await sql<{ orphaned: number }>`
    SELECT count(*)::int AS orphaned FROM batch_jobs WHERE created_by IS NULL
  `.execute(db);
  if ((rows[0]?.orphaned ?? 0) === 0)
    await sql`ALTER TABLE batch_jobs ALTER COLUMN created_by SET NOT NULL`.execute(
      db,
    );
}
