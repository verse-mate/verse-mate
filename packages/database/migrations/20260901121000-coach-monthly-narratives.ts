import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Migration 3 of 9 (change: port-coach-pipeline, design D13).
 *
 * The program-wide monthly narrative — an executive summary and a set of trend
 * paragraphs — moves out of the compiled-in bundle's `monthlyNarratives` map,
 * where publishing one required a deploy.
 *
 * `month` is the primary key (`YYYY-MM`), so re-publishing a month updates it
 * rather than accumulating duplicates the reader would have to disambiguate.
 * Both bodies are arrays of paragraphs and are stored as jsonb rather than
 * flattened, because the portal renders them as separate blocks.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_monthly_narratives ...");
  await db.schema
    .createTable("coach_monthly_narratives")
    .addColumn("month", "text", (col) => col.primaryKey())
    .addColumn("executive_summary", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("trends", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();
  console.log("coach_monthly_narratives created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("coach_monthly_narratives").ifExists().execute();
}
