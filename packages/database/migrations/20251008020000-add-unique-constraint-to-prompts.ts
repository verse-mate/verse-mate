import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  console.log("Adding unique constraint to prompts.prompt_type...");

  await db.schema
    .alterTable("prompts")
    .addUniqueConstraint("unique_prompts_prompt_type", ["prompt_type"])
    .execute();

  console.log("Successfully added unique constraint.");
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log("Dropping unique constraint from prompts.prompt_type...");

  await db.schema
    .alterTable("prompts")
    .dropConstraint("unique_prompts_prompt_type")
    .execute();

  console.log("Successfully dropped unique constraint.");
}
