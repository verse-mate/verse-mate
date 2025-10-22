import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  console.log("Altering batch_jobs.status column to varchar(50)...");

  await db.schema
    .alterTable("batch_jobs")
    .alterColumn("status", (col) => col.setDataType("varchar(50)"))
    .execute();

  console.log("Successfully altered column.");
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log("Reverting batch_jobs.status column to varchar(20)...");

  await db.schema
    .alterTable("batch_jobs")
    .alterColumn("status", (col) => col.setDataType("varchar(20)"))
    .execute();

  console.log("Successfully reverted column.");
}
