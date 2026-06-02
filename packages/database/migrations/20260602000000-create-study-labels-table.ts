import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Inductive-study UI chrome labels, server-side per language.
 *
 * These are the fixed labels/headings that WRAP the study content (section
 * titles, "About …" collapsibles, Movement/Verses/Chapter-theme labels,
 * Expand/Collapse) — identical across all 1,189 chapters, NOT part of any
 * study's data. They used to live only in the bundled `@versemate/studies`
 * package (`labels.ts`, `getStudyLabels`), which meant adding a language's
 * chrome required a new web/mobile build + release.
 *
 * Moving them to the DB lets a new language go live in both clients on the
 * next fetch — no rebuild, no release — the same code→DB move already made
 * for the study-translate prompt. The bundled `getStudyLabels` map (en/ro/es)
 * stays in the clients as the OFFLINE / default fallback; the FE merges the
 * fetched row OVER it, so a missing key degrades to English per-key rather
 * than blanking.
 *
 *   study_labels — one row per `language_code`. `labels` is the full
 *                  StudyLabels object (the 13 chrome strings) as jsonb.
 *                  Keyed by BCP-47 code (e.g. "pt-BR"); the endpoint
 *                  family-matches a request ("ro-RO" / "ro") the same way
 *                  the study + explanation reads do.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating study_labels table...");

  await db.schema
    .createTable("study_labels")
    .addColumn("language_code", "varchar(10)", (col) => col.primaryKey())
    // Full StudyLabels object (the UI chrome strings) for this language.
    .addColumn("labels", "jsonb", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  console.log("Successfully created study_labels table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("study_labels").ifExists().execute();
}
