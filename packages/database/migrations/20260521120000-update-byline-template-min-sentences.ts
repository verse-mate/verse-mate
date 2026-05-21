import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Update the active Byline Template in user_prompt_templates to require
 * "at least 3 complete sentences" per verse Summary — aligns the DB record
 * with the VER-120 quality gate enforced in the generation pipeline.
 *
 * Prior wording said "at least 2-3 sentences", which allowed 2-sentence
 * outputs that fail the quality bar.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "VER-120: updating byline template to require ≥3-sentence summaries...",
  );

  await sql`
    UPDATE user_prompt_templates
    SET prompt_template = REPLACE(
          REPLACE(
            prompt_template,
            'in at least 2-3 sentences',
            'in at least 3 complete sentences'
          ),
          'at least 2-3 sentences',
          'at least 3 complete sentences'
        )
    WHERE explanation_type = 'byline'
  `.execute(db);

  console.log("VER-120: byline template updated.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`
    UPDATE user_prompt_templates
    SET prompt_template = REPLACE(
          prompt_template,
          'in at least 3 complete sentences',
          'in at least 2-3 sentences'
        )
    WHERE explanation_type = 'byline'
  `.execute(db);
}
