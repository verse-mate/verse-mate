import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  console.log(
    "Adding unique constraint to user_prompt_templates.explanation_type...",
  );

  await db.schema
    .alterTable("user_prompt_templates")
    .addUniqueConstraint("unique_user_prompt_templates_explanation_type", [
      "explanation_type",
    ])
    .execute();

  console.log("Successfully added unique constraint.");
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log(
    "Dropping unique constraint from user_prompt_templates.explanation_type...",
  );

  await db.schema
    .alterTable("user_prompt_templates")
    .dropConstraint("unique_user_prompt_templates_explanation_type")
    .execute();

  console.log("Successfully dropped unique constraint.");
}
