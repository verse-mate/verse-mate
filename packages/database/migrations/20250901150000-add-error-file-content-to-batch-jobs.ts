import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("batch_jobs")
    .addColumn("error_file_content", "text")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("batch_jobs")
    .dropColumn("error_file_content")
    .execute();
}
