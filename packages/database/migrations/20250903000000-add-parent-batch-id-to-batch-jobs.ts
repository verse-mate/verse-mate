import type { Kysely } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("batch_jobs")
    .addColumn("parent_batch_id", "integer", (col) =>
      col.references("batch_jobs.id").onDelete("cascade"),
    )
    .execute();

  await db.schema
    .createIndex("idx_batch_jobs_parent_batch_id")
    .on("batch_jobs")
    .column("parent_batch_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("batch_jobs")
    .dropColumn("parent_batch_id")
    .execute();
}
