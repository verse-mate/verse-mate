import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Compensating migration for the reverted VER-120 change (PR #240, reverted in
 * PR #253). The original migration 20260521120000-update-byline-template-min-sentences
 * rewrote the active Byline Template wording from "at least 2-3 sentences" to
 * "at least 3 complete sentences" via a data UPDATE.
 *
 * Reverting PR #240 only removed the migration *file* — the prod DB data change
 * stayed applied. This migration rolls that data change back so the DB matches
 * the reverted code.
 *
 * Note: the orphan kysely_migration row for 20260521120000 must be deleted
 * separately (bun migrate:fix 20260521120000-update-byline-template-min-sentences)
 * before this runs — Kysely's corruption check aborts migrateToLatest before any
 * migration executes while that row exists.
 *
 * Uses the broad pattern "at least 3 complete sentences" so it undoes BOTH
 * forms the original up() produced ("in at least 3 complete sentences" and the
 * bare "at least 3 complete sentences"); the original down() only handled the
 * "in ..." form. Idempotent: REPLACE is a no-op if already in the 2-3 form.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "VER-120 revert: reverting byline template back to '2-3 sentences'...",
  );

  await sql`
    UPDATE user_prompt_templates
    SET prompt_template = REPLACE(
          prompt_template,
          'at least 3 complete sentences',
          'at least 2-3 sentences'
        )
    WHERE explanation_type = 'byline'
  `.execute(db);

  console.log("VER-120 revert: byline template reverted.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`
    UPDATE user_prompt_templates
    SET prompt_template = REPLACE(
          prompt_template,
          'at least 2-3 sentences',
          'at least 3 complete sentences'
        )
    WHERE explanation_type = 'byline'
  `.execute(db);
}
